import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 120;

const SYSTEM_PROMPT = `당신은 특허/IP R&D 제안서 전문 PPT 디자이너입니다.
제안서 내용을 분석하여, 각 섹션에 삽입할 이미지에 대해 매우 구체적인 제작 지침을 제공합니다.

[이미지 스타일 원칙]
- 사람이 PowerPoint에서 도형·아이콘·텍스트박스로 직접 만든 느낌
- AI 생성 티 절대 금지: 사실적 질감, 과도한 빛/그림자, 사진 합성 배제
- flat design, simple geometric shape, clean infographic, icon illustration
- 색상: 남색(#1E3A5F) + 포인트 청색(#2E86C1) + 흰색 + 연회색 조합
- 폰트: 굵은 고딕 계열, 영문은 sans-serif

[출력 형식 — 이미지당 반드시 아래 항목을 모두 작성]

■ 삽입 위치: (제안서의 정확한 섹션명과 위치. 예: "Ⅲ-1 기술전문성 본문 상단 오른쪽")
■ 이미지 유형: (예: 프로세스 다이어그램 / 기술 트리 표 / 비교 인포그래픽 / 아이콘 블록 등)
■ 레이아웃 구조: (도형 배치, 화살표 방향, 컬럼 수 등 구체적 배치 설명)
■ 들어갈 텍스트/레이블: (이미지 안에 실제로 적힐 텍스트를 모두 나열)
■ 이미지 생성 프롬프트 (영문):
\`\`\`
(DALL-E / Midjourney용 영문 프롬프트)
\`\`\`
■ 한줄 설명: (이 이미지가 왜 이 자리에 필요한지)

---
제안서 섹션(S1~S4) 전체를 커버하여 총 4~6개의 이미지를 제안하세요.
각 이미지는 제안서를 읽는 평가위원의 눈길을 멈추게 하고, 아이피랩의 전문성을 시각적으로 강화해야 합니다.`;

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
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `아래 제안서를 분석하여, 각 섹션에 삽입할 이미지를 제안해주세요.

요구사항:
1. 삽입 위치(섹션명+위치), 이미지 유형, 레이아웃 구조, 이미지 안에 들어갈 실제 텍스트/레이블, 영문 생성 프롬프트를 모두 구체적으로 작성
2. "이미지 안에 들어갈 텍스트"는 제안서 내용에서 실제 키워드/수치/기업명을 그대로 사용
3. 사람이 PPT 도형으로 만든 느낌, AI 생성 티 없는 스타일

[제안서]
${draft.slice(0, 8000)}`,
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
