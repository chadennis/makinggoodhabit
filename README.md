# 도전! 한자 · 세계사 퀴즈

## 구성
- `index.html` : 사이트 전체 (문제 데이터는 `<script>` 맨 위)
- `api/attempts.js` : 풀이 기록 저장(POST) / 조회(GET) — Vercel 서버리스 함수
- `api/_db.js` : Neon 연결, 테이블 자동 생성
- `schema.sql` : 테이블 정의 (직접 만들고 싶을 때)

## 배포 (Vercel + Neon)
1. Neon에서 프로젝트를 만들고 Connection string을 복사합니다.
2. 이 폴더를 GitHub 저장소에 올립니다.
3. Vercel에서 저장소를 Import하고, Settings → Environment Variables에
   `DATABASE_URL` = (Neon 연결 문자열) 을 추가한 뒤 Deploy 합니다.
4. 퀴즈를 한 판 끝내면 테이블이 자동 생성되고 기록이 저장됩니다.

## 기록 조회
`https://내도메인/api/attempts?player=아들` → 최근 20판과 많이 틀린 문제 목록(JSON)

## 주의
- 로그인 없는 공개 사이트라 누구나 기록을 보낼 수 있습니다. 가족용으로만 쓰고 주소를 공개하지 마세요.
- `DATABASE_URL`은 절대 index.html이나 GitHub에 쓰지 마세요.
