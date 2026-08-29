# Container image for the alchemy Content Studio request service (AL2).
# Built from the repo root (CDK: DockerImageCode.fromImageAsset("../..", { file: "service/Dockerfile" })).
#
# AL2 ships /health + /v1/whoami. AL3 adds the OpenRouter SDK; AL5's render
# toolchain (Remotion + ffmpeg + Chatterbox) is SEPARATE compute, not this image.
FROM public.ecr.aws/lambda/nodejs:20-arm64 AS build

WORKDIR /build
COPY service/package.json service/tsconfig.json ./
RUN npm install --omit=dev --no-audit --no-fund && cp -r node_modules /tmp/prod_node_modules \
    && npm install --no-audit --no-fund
COPY service/src ./src
RUN npx tsc -p tsconfig.json

FROM public.ecr.aws/lambda/nodejs:20-arm64

# LAMBDA_TASK_ROOT = /var/task
COPY --from=build /tmp/prod_node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=build /build/dist ${LAMBDA_TASK_ROOT}/

# handler = <file>.<export>, ESM
CMD [ "lambda.handler" ]
