# 🌌 Git Constellation

GitHub 커밋 히스토리를 별자리처럼 시각화하는 웹 프로젝트입니다.

## ✨ 특징

- 🌟 커밋을 밤하늘의 별처럼 시각화
- 🔗 동일 작성자의 커밋을 별자리 선으로 연결
- 🎨 3가지 색상 모드 (활동량, 파일 유형, 오로라)
- 📐 3가지 레이아웃 (Force-directed, Radial, Timeline)
- 🔍 각 별에 마우스를 올리면 커밋 상세 정보 표시
- 📊 커밋 통계 대시보드
- 📱 반응형 디자인
- 🔍 줌/팬 인터랙션

## 🚀 사용법

1. [git-constellation.vercel.app](https://git-constellation.vercel.app) 접속
2. `사용자명/레포` 형식으로 입력 (예: `torvalds/linux`)
3. 기간, 레이아웃, 색상 모드 선택
4. 별자리 탐색!

## 🛠 기술 스택

- **D3.js** — 시각화 엔진
- **GitHub REST API** — 커밋 데이터 수집
- **Vercel** — 배포
- 순수 HTML/CSS/JS — 프레임워크 없음

## 🌌 별자리 해석

| 별 크기 | 의미 |
|---------|------|
| 작은 별 | 적은 변경량 (적은 라인 수정) |
| 큰 별 | 대규모 변경 (많은 라인 수정) |
| 별의 밝기 | 커밋의 활동량 |
| 연결선 (파랑) | 동일 작성자의 연속 커밋 |
| 연결선 (보라) | 같은 파일 유형 수정 |

## 📜 라이선스

MIT

---

Made with ✨ by [ICBM2](https://github.com/sigco3111)
