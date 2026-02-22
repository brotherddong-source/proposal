import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/app/lib/prompts';

export const maxDuration = 300;

type FileContentPart = {
  type: 'file';
  file: { filename: string; file_data: string };
};

type TextContentPart = {
  type: 'text';
  text: string;
};

const MIME_MAP: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
};

async function toBase64Part(file: File): Promise<FileContentPart> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type || MIME_MAP[ext] || 'application/octet-stream';
  return {
    type: 'file',
    file: {
      filename: file.name,
      file_data: `data:${mime};base64,${base64}`,
    },
  };
}

async function toTextPart(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `[${file.name}]\n${buffer.toString('utf-8').slice(0, 20000)}`;
}

export async function POST(request: NextRequest) {
  const client = new OpenAI();
  try {
    const formData = await request.formData();
    const technologyDomain = formData.get('technologyDomain') as string;
    const historyText = (formData.get('historyText') as string) || '';

    const contentParts: (FileContentPart | TextContentPart)[] = [];
    const textSections: string[] = [];

    // ① 수요기업 기술자료(RFP) — PDF → GPT에 직접 전달
    const rfpFiles = formData.getAll('rfpFiles') as File[];
    for (const file of rfpFiles) {
      try {
        contentParts.push(await toBase64Part(file));
      } catch {
        textSections.push(`[RFP: ${file.name}] (파싱 실패)`);
      }
    }

    // ② 제안서 예시 — PDF → GPT에 직접 전달
    const sampleFiles = formData.getAll('sampleFiles') as File[];
    for (const file of sampleFiles) {
      try {
        contentParts.push(await toBase64Part(file));
        textSections.push(`[제안서 예시 파일명: ${file.name}]`);
      } catch {
        textSections.push(`[제안서 예시: ${file.name}] (파싱 실패)`);
      }
    }

    // ③ 과제 수행 리스트 — 모든 파일 형식을 base64로 GPT에 직접 전달
    const taskListFiles = formData.getAll('taskListFiles') as File[];
    for (const file of taskListFiles) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'txt') {
          // TXT는 텍스트로 읽어서 전달 (토큰 절약)
          const text = await toTextPart(file);
          textSections.push(`[아이피랩 수행 과제 리스트]\n${text}`);
        } else {
          // PDF, DOCX, XLSX 등 → base64로 GPT에 직접 전달
          contentParts.push(await toBase64Part(file));
        }
      } catch {
        textSections.push(`[${file.name}] (파싱 실패)`);
      }
    }

    // ④ 관련 이력사항 — 모든 파일 형식을 base64로 GPT에 직접 전달
    const historyFiles = formData.getAll('historyFiles') as File[];
    const historyParts: string[] = [];
    for (const file of historyFiles) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'txt') {
          historyParts.push(await toTextPart(file));
        } else {
          contentParts.push(await toBase64Part(file));
        }
      } catch {
        historyParts.push(`[${file.name}] (파싱 실패)`);
      }
    }
    if (historyText.trim()) historyParts.push(historyText.trim());
    if (historyParts.length > 0) {
      textSections.push(`[가장 관련이 높은 이력사항]\n${historyParts.join('\n\n')}`);
    }

    const userText = [
      `기술 분야: ${technologyDomain}`,
      rfpFiles.length === 0 ? '[수요기업 기술자료(RFP)]: (제공 없음)' : '',
      ...textSections,
      '',
      '위 정보를 기반으로 제안서를 S1부터 S4까지 자동 완주하여 최종 출력해주세요.',
      '(※ 웹 검색 불가 환경입니다. 학습된 지식과 제공된 자료를 최대한 활용하여 구체적으로 작성해주세요.)',
    ].filter(Boolean).join('\n');

    contentParts.push({ type: 'text', text: userText });

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: contentParts as any },
      ],
      stream: true,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Generate error:', message);
    return new Response(
      JSON.stringify({ error: `제안서 생성 중 오류: ${message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
