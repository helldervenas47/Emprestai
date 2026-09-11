FROM denoland/deno:alpine-2.4.5
WORKDIR /app
COPY worker.ts .
CMD ["run", "--allow-env", "--allow-net", "worker.ts"]
