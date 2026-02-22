'use client';

import { useState, useRef, useCallback } from 'react';

type Step = 1 | 2 | 3;

const TECH_DOMAINS = ['인공지능', '전자', '로봇', '기계', '소재', '기타'];

const REVISION_TYPE_INFO = {
  1: {
    title: '타입 1 수정',
    desc: '문장 길이/톤을 특허전략개발원 제출용으로 더 임팩트하게 정리한 버전',
  },
  2: {
    title: '타입 2 수정',
    desc: '문장을 보다 공격적으로 작성하여 무엇을 하겠다는 형태로 작성',
  },
};

// 파일 드롭존 공통 컴포넌트
function FileDropZone({
  label,
  required,
  files,
  accept,
  multiple,
  hint,
  onFiles,
}: {
  label: string;
  required: boolean;
  files: File[];
  accept: string;
  multiple?: boolean;
  hint?: string;
  onFiles: (files: File[]) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      accept.split(',').some((ext) => f.name.toLowerCase().endsWith(ext.trim().replace('*', '')))
    );
    if (dropped.length) onFiles(multiple ? dropped : [dropped[0]]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) onFiles(multiple ? selected : [selected[0]]);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    onFiles(files.filter((_, i) => i !== idx));
  };

  const hasFiles = files.length > 0;

  return (
    <div className="p-4">
      <p className="text-xs text-gray-500 mb-2">
        {label}&nbsp;
        <span className={`font-medium ${required ? 'text-red-500' : 'text-gray-400'}`}>
          * {required ? '필수' : '선택'}
        </span>
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors select-none ${
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : hasFiles
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        {hasFiles ? (
          <p className="text-xs text-green-600 font-medium">
            {files.length}개 파일 업로드됨
            <br />
            <span className="text-gray-400 font-normal">클릭하여 추가</span>
          </p>
        ) : (
          <>
            <p className="text-gray-500 text-xs">{hint || 'PDF 파일을 넣어주세요'}</p>
            {multiple && <p className="text-gray-400 text-xs mt-0.5">여러 파일 선택 가능</p>}
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
      />

      {hasFiles && (
        <ul className="mt-2 space-y-1">
          {files.map((f, idx) => (
            <li key={idx} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
              <span className="truncate max-w-[85%]">{f.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                className="text-gray-400 hover:text-red-400 ml-1 flex-shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>(1);

  // ── Step 1 inputs ──
  const [selectedDomain, setSelectedDomain] = useState('');
  const [rfpFiles, setRfpFiles] = useState<File[]>([]);          // 수요기업 기술자료(RFP) - 필수
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);    // 제안서 예시 - 선택
  const [taskListFiles, setTaskListFiles] = useState<File[]>([]); // 과제 수행 리스트 - 선택
  const [historyFiles, setHistoryFiles] = useState<File[]>([]);  // 관련 이력사항 파일 - 선택
  const [historyText, setHistoryText] = useState('');            // 관련 이력사항 직접 입력 - 선택

  // ── Step 2 state ──
  const [draft, setDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [imagePrompts, setImagePrompts] = useState('');
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);

  // ── Step 3 state ──
  const [revised, setRevised] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [activeRevisionType, setActiveRevisionType] = useState<1 | 2 | null>(null);
  const [reviseError, setReviseError] = useState('');

  const streamText = async (
    url: string,
    options: RequestInit,
    onChunk: (text: string) => void
  ) => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  };

  const handleGenerate = async () => {
    if (!selectedDomain || rfpFiles.length === 0) return;
    setIsGenerating(true);
    setGenerateError('');
    setDraft('');
    setStep(2);

    try {
      const formData = new FormData();
      formData.append('technologyDomain', selectedDomain);

      // RFP 파일 (필수, 여러 개 가능)
      rfpFiles.forEach((f) => formData.append('rfpFiles', f));

      // 제안서 예시 (선택)
      sampleFiles.forEach((f) => formData.append('sampleFiles', f));

      // 과제 수행 리스트 (선택)
      taskListFiles.forEach((f) => formData.append('taskListFiles', f));

      // 관련 이력사항 - 파일 또는 텍스트
      historyFiles.forEach((f) => formData.append('historyFiles', f));
      formData.append('historyText', historyText);

      let accumulated = '';
      await streamText('/api/generate', { method: 'POST', body: formData }, (chunk) => {
        accumulated += chunk;
        setDraft(accumulated);
      });
    } catch (err) {
      console.error(err);
      setGenerateError('제안서 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
      setStep(1);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImagePrompts = async () => {
    if (!draft || isGeneratingImages) return;
    setIsGeneratingImages(true);
    setImagePrompts('');
    try {
      let accumulated = '';
      await streamText(
        '/api/image-prompts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft }),
        },
        (chunk) => {
          accumulated += chunk;
          setImagePrompts(accumulated);
        }
      );
    } catch (err) {
      console.error(err);
      setImagePrompts('이미지 프롬프트 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const handleRevise = async (type: 1 | 2) => {
    setIsRevising(true);
    setReviseError('');
    setRevised('');
    setActiveRevisionType(type);
    setStep(3);

    try {
      let accumulated = '';
      await streamText(
        '/api/revise',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft, revisionType: type }),
        },
        (chunk) => {
          accumulated += chunk;
          setRevised(accumulated);
        }
      );
    } catch (err) {
      console.error(err);
      setReviseError('제안서 수정 중 오류가 발생했습니다. 다시 시도해주세요.');
      setStep(2);
    } finally {
      setIsRevising(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('클립보드에 복사되었습니다.');
    } catch {
      alert('복사 실패. 직접 선택하여 복사해주세요.');
    }
  };

  const resetAll = useCallback(() => {
    setStep(1);
    setSelectedDomain('');
    setRfpFiles([]);
    setSampleFiles([]);
    setTaskListFiles([]);
    setHistoryFiles([]);
    setHistoryText('');
    setDraft('');
    setRevised('');
    setImagePrompts('');
    setGenerateError('');
    setReviseError('');
    setActiveRevisionType(null);
  }, []);

  const canGenerate = !!selectedDomain && rfpFiles.length > 0 && !isGenerating;

  const MODULE_TITLE: Record<Step, string> = {
    1: '입력모듈',
    2: '제안서 초안 출력모듈',
    3: '제안서 출력',
  };

  const MODULE_SUBTITLE: Record<Step, string> = {
    1: '필수파일이 모두 업로드된 경우에만 제안서가 생성됩니다.',
    2: '제안서 초안이 출력됩니다. 수정이 필요하면, 타입 1 또는 타입 2 중에서 선택하세요.',
    3: '제안서 수정안이 출력됩니다.',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="px-8 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-800">과제 제안서 작성기</h1>
        <p className="text-sm text-gray-500 mt-0.5">특허전략개발원 과제 제안서 작성기입니다</p>
      </header>

      {/* Module Banner */}
      <div className="mx-8 bg-blue-600 text-white text-center py-3 text-lg font-semibold rounded">
        {MODULE_TITLE[step]}
      </div>

      <p className="text-center text-sm text-gray-500 py-3">{MODULE_SUBTITLE[step]}</p>

      <main className="px-8 pb-10">

        {/* ── STEP 1: 입력 모듈 ── */}
        {step === 1 && (
          <>
            {/* Row 1: 기술분야 + 파일 3종 */}
            <div className="grid grid-cols-4 gap-4 mb-4">

              {/* ① 기술 분야 선택 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  기술 분야 선택
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-3">
                    기술분야&nbsp;<span className="text-red-500 font-medium">* 필수</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {TECH_DOMAINS.map((domain) => (
                      <button
                        key={domain}
                        onClick={() => setSelectedDomain(domain)}
                        className={`py-3 rounded text-sm font-medium transition-colors ${
                          selectedDomain === domain
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {domain}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ② 수요기업 기술자료(RFP) — 필수 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  수요기업 기술자료(RFP)
                </div>
                <FileDropZone
                  label="과제 RFP"
                  required={true}
                  files={rfpFiles}
                  accept=".pdf"
                  hint="PDF 파일을 넣어주세요 (과제의 RFP)"
                  onFiles={setRfpFiles}
                />
              </div>

              {/* ③ 제안서 예시 — 선택, 복수 가능 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  제안서 예시
                </div>
                <FileDropZone
                  label="기존 제안서 샘플"
                  required={false}
                  files={sampleFiles}
                  accept=".pdf"
                  multiple
                  hint="PDF 파일을 넣어주세요 (복수 가능)"
                  onFiles={setSampleFiles}
                />
              </div>

              {/* ④ 과제 수행 리스트 — 선택 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  아이피랩 과제 수행 리스트
                </div>
                <FileDropZone
                  label="과제 수행 이력 파일"
                  required={false}
                  files={taskListFiles}
                  accept=".pdf,.txt,.xlsx,.docx"
                  hint="PDF · TXT · Excel · Word 지원"
                  onFiles={setTaskListFiles}
                />
              </div>
            </div>

            {/* Row 2: 관련 이력사항 — 파일 또는 텍스트 */}
            <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
              <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                가장 관련이 높은 이력사항&nbsp;<span className="text-gray-400 font-normal text-xs">* 선택</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                {/* 파일 업로드 */}
                <FileDropZone
                  label="파일로 업로드"
                  required={false}
                  files={historyFiles}
                  accept=".pdf,.txt,.docx,.doc"
                  hint="PDF · TXT · Word 지원"
                  onFiles={setHistoryFiles}
                />
                {/* 직접 입력 */}
                <div className="p-4 flex flex-col">
                  <p className="text-xs text-gray-500 mb-2">직접 입력</p>
                  <textarea
                    value={historyText}
                    onChange={(e) => setHistoryText(e.target.value)}
                    placeholder={"과제명, 수행 내용 등 관련 이력을 자유롭게 입력하세요.\n예) 2023년 산업부 소재부품장비 IP R&D — 히트펌프 핵심특허 분석 및 회피설계 수행"}
                    rows={5}
                    className="w-full flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  />
                </div>
              </div>
            </div>

            {generateError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                {generateError}
              </div>
            )}

            <div className="flex justify-center mt-6">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`px-14 py-3 rounded-lg font-semibold text-white text-base transition-colors ${
                  canGenerate
                    ? 'bg-green-600 hover:bg-green-700 shadow'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                제안서 생성
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: 초안 출력 ── */}
        {step === 2 && (
          <div className="grid grid-cols-3 gap-4">

            {/* 초안 출력 (2/3) */}
            <div className="col-span-2 border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
              <div className="flex items-center justify-between bg-slate-100 px-4 py-3">
                <span className="text-gray-700 font-semibold text-sm">초안 출력</span>
                {!isGenerating && draft && (
                  <button
                    onClick={() => handleCopy(draft)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    복사
                  </button>
                )}
              </div>
              <div className="p-5 max-h-[68vh] overflow-y-auto">
                {isGenerating && !draft && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm" />
                    생성 중...
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                  {draft}
                  {isGenerating && draft && (
                    <span className="inline-block w-1.5 h-4 bg-gray-500 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              </div>
            </div>

            {/* 오른쪽 패널 (1/3) — 수정 방향 + 이미지 프롬프트 */}
            <div className="flex flex-col gap-4">

              {/* 수정 방향 선택 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  수정 방향 선택
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-4">초안에 대하여 수정방향을 선택</p>
                  <div className="space-y-4">
                    {([1, 2] as const).map((type) => (
                      <div key={type}>
                        <button
                          onClick={() => handleRevise(type)}
                          disabled={isRevising || isGenerating}
                          className={`w-full py-3 px-3 rounded font-semibold text-sm text-white transition-colors ${
                            isRevising && activeRevisionType === type
                              ? 'bg-blue-400 cursor-wait'
                              : isRevising || isGenerating
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-gray-600 hover:bg-gray-700'
                          }`}
                        >
                          {isRevising && activeRevisionType === type
                            ? '수정 중...'
                            : REVISION_TYPE_INFO[type].title}
                        </button>
                        <p className="text-xs text-gray-400 mt-1.5 px-0.5 leading-relaxed">
                          {REVISION_TYPE_INFO[type].desc}
                        </p>
                      </div>
                    ))}
                  </div>
                  {reviseError && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
                      {reviseError}
                    </div>
                  )}
                  <button
                    onClick={resetAll}
                    className="mt-6 w-full py-2 border border-gray-300 rounded text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    처음으로
                  </button>
                </div>
              </div>

              {/* 이미지 프롬프트 */}
              <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 text-gray-700 font-semibold text-center py-3 text-sm">
                  PPT 이미지 프롬프트
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-3">
                    제안서에 어울리는 이미지 생성 프롬프트를 만들어 드립니다
                  </p>
                  <button
                    onClick={handleGenerateImagePrompts}
                    disabled={!draft || isGenerating || isGeneratingImages}
                    className={`w-full py-2.5 rounded font-semibold text-sm text-white transition-colors ${
                      isGeneratingImages
                        ? 'bg-purple-400 cursor-wait'
                        : !draft || isGenerating
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                  >
                    {isGeneratingImages ? '생성 중...' : '이미지 프롬프트 생성'}
                  </button>
                  {imagePrompts && (
                    <div className="mt-3 max-h-60 overflow-y-auto">
                      <div className="flex justify-end mb-1">
                        <button
                          onClick={() => handleCopy(imagePrompts)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          복사
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed font-sans">
                        {imagePrompts}
                        {isGeneratingImages && (
                          <span className="inline-block w-1.5 h-3 bg-gray-500 animate-pulse ml-0.5 align-middle" />
                        )}
                      </pre>
                    </div>
                  )}
                  {isGeneratingImages && !imagePrompts && (
                    <div className="mt-3 flex items-center gap-2 text-gray-400 text-xs">
                      <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse rounded-sm" />
                      프롬프트 생성 중...
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── STEP 3: 수정안 출력 ── */}
        {step === 3 && (
          <>
            <div className="border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
              <div className="flex items-center justify-between bg-slate-100 px-4 py-3">
                <span className="text-gray-700 font-semibold text-sm">
                  수정안 출력
                  {activeRevisionType && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      (타입 {activeRevisionType} 적용)
                    </span>
                  )}
                </span>
                {!isRevising && revised && (
                  <button
                    onClick={() => handleCopy(revised)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    복사
                  </button>
                )}
              </div>
              <div className="p-5 max-h-[68vh] overflow-y-auto">
                {isRevising && !revised && (
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm" />
                    수정 중...
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                  {revised}
                  {isRevising && revised && (
                    <span className="inline-block w-1.5 h-4 bg-gray-500 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              </div>
            </div>

            <div className="flex justify-center gap-3 mt-5">
              <button
                onClick={() => setStep(2)}
                className="py-2 px-7 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                초안으로 돌아가기
              </button>
              <button
                onClick={resetAll}
                className="py-2 px-7 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                처음으로
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
