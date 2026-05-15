# slides-grab 한국어 README

<p align="center">AI가 만든 HTML 슬라이드에서 원하는 영역을 직접 선택하고, 그 영역을 다시 AI에게 편집시킬 수 있는 에이전트 우선 발표 자료 프레임워크입니다.</p>

<p align="center">
  <a href="README.md">English README</a> | <strong>한국어</strong>
</p>

## 빠른 시작

slides-grab은 슬라이드를 HTML과 CSS로 작성하고, 브라우저 기반 편집기에서 영역을 드래그해 수정 요청을 보낸 뒤 PDF 또는 실험적/불안정한 PPTX·Figma용 PPTX로 내보내는 도구입니다.

AI 코딩 에이전트에 아래 안내 중 하나를 붙여넣어 설치를 시작할 수 있습니다.

**Claude Code:**

```text
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/installation/claude.md and follow every step.
```

**Codex:**

```text
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/installation/codex.md and follow every step.
```

저장소를 직접 개발하거나 수정하려면 다음을 실행합니다.

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

> Node.js **20 이상**이 필요합니다.

### 설치: 저장소를 클론하지 않는 방법

CLI와 공유 에이전트 스킬만 사용하려면 npm 패키지를 설치하면 됩니다.

```bash
npm install slides-grab
npx playwright install chromium
npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy
```

이 방법은 일반적인 사용에 충분합니다. slides-grab 자체를 수정하거나 기여하려는 경우에만 저장소를 클론하세요.

## 왜 slides-grab인가요?

많은 AI 도구가 슬라이드 HTML을 생성하지만, 사용자가 화면에서 **수정하고 싶은 부분을 직접 가리키고** 그 자리에서 반복 편집할 수 있게 해 주는 도구는 드뭅니다. slides-grab은 다음 흐름을 제공합니다.

- **Plan** — 에이전트가 주제나 파일을 바탕으로 슬라이드 아웃라인을 만듭니다.
- **Design** — 에이전트가 각 슬라이드를 독립적인 HTML 파일로 작성합니다.
- **Edit** — 브라우저 편집기에서 bbox 영역 선택, 직접 텍스트 편집, 에이전트 기반 재작성을 수행합니다.
- **Export** — 한 명령으로 PDF를 만들고, 실험적/불안정한 PPTX 또는 Figma 가져오기용 PPTX도 생성할 수 있습니다.

## CLI 명령어

워크플로 명령은 `--slides-dir <path>`를 지원하며 기본값은 `slides`입니다.

새 클론에서는 `--help`, `list-templates`, `list-styles`, `preview-styles` 같은 탐색 명령은 덱 없이도 동작합니다. `edit`, `build-viewer`, `validate`, `convert`, `pdf`는 `slide-*.html` 파일이 들어 있는 슬라이드 작업공간이 필요합니다.

```bash
slides-grab edit              # 시각적 슬라이드 편집기 실행
slides-grab build-viewer      # 단일 viewer.html 생성
slides-grab validate          # Playwright 기반 슬라이드 HTML 검증
slides-grab convert           # 실험적/불안정한 PPTX로 내보내기
slides-grab convert --resolution 2160p  # 고해상도 래스터 PPTX 내보내기
slides-grab figma             # Figma Slides 가져오기용 실험적/불안정한 PPTX 생성
slides-grab pdf               # 캡처 모드 PDF 내보내기(기본값)
slides-grab pdf --resolution 2160p  # 고해상도 이미지 기반 PDF 내보내기
slides-grab pdf --mode print  # 검색/선택 가능한 텍스트 PDF 내보내기
slides-grab png               # 슬라이드별 PNG 렌더링(기본 2160p)
slides-grab png --slide-mode card-news  # 인스타그램용 정사각형 PNG 렌더링
slides-grab image --prompt "..."    # 로컬 슬라이드 이미지 생성
slides-grab fetch-video --url <youtube-url> --slides-dir decks/my-deck  # yt-dlp로 동영상 에셋 다운로드
slides-grab tldraw            # .tldr 다이어그램을 슬라이드 크기의 로컬 SVG로 렌더링
slides-grab list-templates    # 사용 가능한 슬라이드 템플릿 표시
slides-grab list-styles       # 번들된 35개 디자인 스타일 표시
slides-grab preview-styles    # 35개 스타일 미리보기 갤러리를 브라우저에서 열기
```

## 디자인 스타일 모음

slides-grab은 [corazzon/pptx-design-styles](https://github.com/corazzon/pptx-design-styles)에서 파생된 30개 스타일과 slides-grab 고유 스타일 5개, 총 35개 디자인 스타일을 제공합니다. 에이전트에게 특정 스타일을 요청하거나 완전히 커스텀 디자인을 요청할 수 있습니다.

```bash
slides-grab list-styles
slides-grab preview-styles
```

## 에셋 규칙

슬라이드에서 사용하는 로컬 이미지와 동영상은 `<slides-dir>/assets/`에 저장하고 각 `slide-XX.html`에서는 `./assets/<file>` 형식으로 참조하세요.

- 권장 이미지: `<img src="./assets/example.png" alt="...">`
- 권장 동영상: `<video src="./assets/demo.mp4" poster="./assets/demo-poster.png"></video>`
- 허용: 완전한 자체 포함 슬라이드를 위한 `data:` URL
- 저장된 슬라이드에서 금지: 원격 `http(s)://` 이미지 URL
- 지원하지 않음: `/Users/...` 또는 `C:\...` 같은 절대 파일 경로
- 저장된 슬라이드에서 지원하지 않음: 원격 동영상 URL. 먼저 `<slides-dir>/assets/`로 다운로드하세요.

내보내기 전에 다음 명령으로 누락된 로컬 에셋과 권장하지 않는 경로 형식을 확인하세요.

```bash
slides-grab validate --slides-dir <path>
```

## 이미지 생성

`slides-grab image`는 프롬프트로 슬라이드용 이미지를 생성하고 결과를 `<slides-dir>/assets/`에 저장한 뒤 HTML에서 사용할 `./assets/<file>` 참조를 출력합니다.

```bash
codex login
slides-grab image --slides-dir decks/my-deck --prompt "Editorial hero image of a robotics warehouse at dawn"
```

기본 이미지 생성 공급자는 로컬 Codex ChatGPT 로그인(`~/.codex/auth.json`)을 재사용할 수 있습니다. 선택적으로 `--provider codex`에는 `OPENAI_API_KEY`, `--provider nano-banana`에는 `GOOGLE_API_KEY` 또는 `GEMINI_API_KEY`가 필요할 수 있습니다.

> 경고: 일부 이미지 생성 경로는 지원되지 않는 비공개 백엔드 또는 계정 권한에 의존할 수 있으므로, 실패하면 웹 검색과 로컬 다운로드 방식으로 대체하세요.

## 여러 덱 작업 흐름

먼저 `decks/my-deck/`에 덱을 만들거나 생성한 뒤 다음처럼 작업할 수 있습니다.

```bash
slides-grab edit       --slides-dir decks/my-deck
slides-grab validate   --slides-dir decks/my-deck
slides-grab pdf        --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab pdf        --slides-dir decks/my-deck --mode print --output decks/my-deck-searchable.pdf
slides-grab png        --slides-dir decks/my-deck --output-dir decks/my-deck/out-png
slides-grab convert    --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma      --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

> **주의:** `slides-grab convert`와 `slides-grab figma`는 현재 **실험적/불안정한** 기능입니다. 출력은 최선의 결과이며 PowerPoint 또는 Figma에서 수동 정리가 필요할 수 있습니다.

## 카드뉴스 작업 흐름

인스타그램식 카드뉴스는 720pt × 720pt 정사각형 프레임을 사용합니다. 모든 단계에서 `--mode card-news` 또는 `--slide-mode card-news`를 맞춰 사용하고, 최종 배포물은 `slides-grab png`를 우선 권장합니다.

```bash
slides-grab edit     --slides-dir decks/my-cards --mode card-news
slides-grab validate --slides-dir decks/my-cards --mode card-news
slides-grab png      --slides-dir decks/my-cards --slide-mode card-news --resolution 2160p
slides-grab pdf      --slides-dir decks/my-cards --slide-mode card-news --output decks/my-cards.pdf
slides-grab convert  --slides-dir decks/my-cards --mode card-news --output decks/my-cards.pptx
```

## 설치 가이드

자세한 에이전트별 설치 안내는 아래 문서를 참고하세요.

- [Claude 상세 가이드](docs/installation/claude.md)
- [Codex 상세 가이드](docs/installation/codex.md)

## 프로젝트 구조

```text
bin/              CLI 진입점
src/editor/       시각 편집기(HTML + JS 클라이언트 모듈)
scripts/          빌드, 검증, 변환, 편집기 서버 스크립트
templates/        슬라이드 HTML 템플릿(cover, content, chart 등)
src/              디자인 스타일 데이터, 스타일 설정, 경로 해석
skills/           공유 가능한 에이전트 스킬과 참고 문서
docs/             설치 및 사용 가이드
showcase/         GitHub Pages로 배포되는 정적 갤러리
```

## 라이선스

[MIT](LICENSE)

## 감사의 말

이 프로젝트는 Builder Josh의 [ppt_team_agent](https://github.com/uxjoseph/ppt_team_agent)를 바탕으로 만들어졌습니다. 감사드립니다!
