import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { REVISION_PROMPTS } from '@/app/lib/prompts';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const client = new OpenAI();
  try {
    const { draft, revisionType } = await request.json();

    if (!draft || !revisionType) {
      return new Response(
        JSON.stringify({ error: '필수 데이터가 누락되었습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const typeNum = Number(revisionType) as 1 | 2;
    if (typeNum !== 1 && typeNum !== 2) {
      return new Response(
        JSON.stringify({ error: '잘못된 수정 타입입니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const revisionPrompt = REVISION_PROMPTS[typeNum];

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `다음 제안서 초안을 아래 지침에 따라 수정해주세요.

[제안서 초안]
${draft}

---

[수정 지침]
${revisionPrompt}`,
        },
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
    console.error('Revise error:', error);
    return new Response(
      JSON.stringify({ error: '제안서 수정 중 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
