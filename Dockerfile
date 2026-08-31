# 1. 가볍고 빠른 Nginx 알파인 이미지 사용
FROM nginx:alpine

# 2. 내 컴퓨터의 현재 폴더(정적 파일들)를 Nginx의 웹 루트 디렉토리로 복사
COPY . /usr/share/nginx/html

# 3. Railway가 인식할 수 있도록 포트 노출 (Nginx 기본값은 80)
EXPOSE 80

# 4. 백그라운드가 아닌 포그라운드에서 Nginx 실행 (도커 필수 옵션)
CMD ["nginx", "-g", "daemon off;"]
