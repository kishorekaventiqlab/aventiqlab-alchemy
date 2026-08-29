# Container image for the alchemy Content Studio request service (AL2).
# Build context is the `service/` directory (CDK: DockerImageCode.fromImageAsset("..")
# from service/infra, i.e. the service/ dir). See service/.dockerignore.
#
# AL2 ships /health + /v1/whoami. AL3 adds the OpenRouter SDK; AL5's render
# toolchain (Remotion + ffmpeg + Chatterbox) is SEPARATE compute, not this image.
FROM public.ecr.aws/lambda/nodejs:20-arm64 AS build

WORKDIR /build
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npx tsc -p tsconfig.json \
    && npm prune --omit=dev

FROM public.ecr.aws/lambda/nodejs:20-arm64

# LAMBDA_TASK_ROOT = /var/task
COPY --from=build /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=build /build/dist ${LAMBDA_TASK_ROOT}/

# handler = <file>.<export>, ESM
CMD [ "lambda.handler" ]
