import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/app/lib/prompts';

export const maxDuration = 300;

async function extractPdfText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const { default: pdfParse } = await import('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractFileText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    return extractPdfText(file);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString('utf-8');
}

export async function POST(request: NextRequest) {
  const client = new OpenAI();
  try {
    const formData = await request.formData();
    const technologyDomain = formData.get('technologyDomain') as string;
    const historyText = (formData.get('historyText') as string) || '';

    // ① 수요기업 기술자료(RFP) — 필수
    const rfpFiles = formData.getAll('rfpFiles') as File[];
    let rfpSection = '';
    if (rfpFiles.length > 0) {
      const texts: string[] = [];
      for (const file of rfpFiles) {
        try {
          const text = await extractPdfText(file);
          texts.push(`[${file.name}]\n${text.slice(0, 40000)}`);
        } catch {
          texts.push(`[${file.name}] (파싱 실패)`);
        }
      }
      rfpSection = texts.join('\n\n');
    }

    // ② 제안서 예시 — 선택
    const sampleFiles = formData.getAll('sampleFiles') as File[];
    let sampleSection = '';
    if (sampleFiles.length > 0) {
      const texts: string[] = [];
      for (const file of sampleFiles) {
        try {
          const text = await extractPdfText(file);
          texts.push(`[예시: ${file.name}]\n${text.slice(0, 15000)}`);
        } catch {
          texts.push(`[예시: ${file.name}] (파싱 실패)`);
        }
      }
      sampleSection = `[제안서 예시]\n${texts.join('\n\n')}`;
    }

    // ③ 과제 수행 리스트 — 선택
    const taskListFiles = formData.getAll('taskListFiles') as File[];
    let taskListSection = '';
    if (taskListFiles.length > 0) {
      const texts: string[] = [];
      for (const file of taskListFiles) {
        try {
          const text = await extractFileText(file);
          texts.push(`[${file.name}]\n${text.slice(0, 20000)}`);
        } catch {
          texts.push(`[${file.name}] (파싱 실패)`);
        }
      }
      taskListSection = `[아이피랩 수행 과제 리스트]\n${texts.join('\n\n')}`;
    }

    // ④ 가장 관련이 높은 이력사항 — 파일 또는 텍스트 (선택)
    const historyFiles = formData.getAll('historyFiles') as File[];
    const historyParts: string[] = [];
    for (const file of historyFiles) {
      try {
        const text = await extractFileText(file);
        historyParts.push(`[${file.name}]\n${text.slice(0, 10000)}`);
      } catch {
        historyParts.push(`[${file.name}] (파싱 실패)`);
      }
    }
    if (historyText.trim()) {
      historyParts.push(historyText.trim());
    }
    const historySection = historyParts.length > 0
      ? `[가장 관련이 높은 이력사항]\n${historyParts.join('\n\n')}`
      : '';

    const userMessage = `기술 분야: ${technologyDomain}

[수요기업 기술자료(RFP)]
${rfpSection || '(제공된 RFP 없음)'}

${sampleSection}

${taskListSection}

${historySection}

위 정보를 기반으로 제안서를 S1부터 S4까지 자동 완주하여 최종 출력해주세요.
(※ 현재 웹 검색이 불가능한 환경입니다. 학습된 지식과 제공된 자료 내용을 최대한 활용하여 구체적으로 작성해주세요.)`;

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
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
    console.error('Generate error:', error);
    return new Response(
      JSON.stringify({ error: '제안서 생성 중 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
