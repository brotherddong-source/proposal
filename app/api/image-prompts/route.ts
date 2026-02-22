import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 120;

const SYSTEM_PROMPT = `당신은 PPT 디자인 전문가입니다.
제안서 내용을 보고, 제안서에 삽입할 이미지에 대한 영문 이미지 생성 프롬프트를 작성합니다.

[이미지 방향성]
- 사람이 직접 PowerPoint나 Keynote로 만든 것처럼 보이는 스타일
- AI가 생성한 티가 나지 않도록: 지나치게 완벽한 조명, 과도한 디테일, 사실적 질감 배제
- flat design, simple icon-style illustration, clean infographic, geometric shapes 계열
- 색상은 파란색/회색/흰색 계열의 전문적이고 절제된 팔레트
- 기술/특허/IP 관련 비즈니스 문서에 어울리는 분위기

[출력 형식]
제안서 섹션별로 2~3개의 이미지 프롬프트를 제안합니다.
각 프롬프트는 아래 형식으로 작성합니다:

**[섹션명 / 이미지 용도]**
\`\`\`
(영문 이미지 생성 프롬프트)
\`\`\`
- 용도 설명: (해당 이미지가 어디에 들어가면 좋은지 한 줄 설명)`;

export async function POST(request: NextRequest) {
  const client = new OpenAI();
  try {
    const { draft } = await request.json();

    if (!draft) {
      return new Response(
        JSON.stringify({ error: '제안서 초안이 누락되었습니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `아래 제안서를 보고, 제안서를 돋보이게 할 이미지 프롬프트를 섹션별로 제안해주세요.\n사람이 PPT로 만든 느낌이 나도록, AI티가 나지 않는 스타일로 작성해주세요.\n\n[제안서]\n${draft.slice(0, 6000)}`,
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
    console.error('Image prompts error:', error);
    return new Response(
      JSON.stringify({ error: '이미지 프롬프트 생성 중 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
