# BFF Service

Backend-for-Frontend для AWS Shop. NestJS 10 + Fastify (Express запрещён правилами задачи). Слушает любой HTTP-запрос, по первому сегменту URL определяет имя сервиса-получателя, ищет его базовый URL в `.env` / `process.env` и форвардит запрос на upstream.

```
{bff}/{recipient-name}/{tail}?query  ─►  {process.env[recipient-name]}/{tail}?query
```

## Поддерживаемые получатели (по умолчанию)

| URL prefix | Назначение |
|---|---|
| `/product/*` | Product Service (API Gateway) |
| `/cart/*`    | Cart Service (Elastic Beanstalk) |
| `/import/*`  | Import Service (API Gateway, basic-auth) |

Любое имя, отсутствующее в `.env`, возвращает `502 {"message":"Cannot process request"}` — как требует спецификация задачи.

## Локальный запуск

```bash
cp .env.example .env       # подставить актуальные URL (особенно для cart)
npm install
npm run start:dev
```

Дефолтный порт — `4001` (на EB переключается на `80`).

### Быстрая проверка curl

```bash
# Неизвестный сервис -> 502
curl -i http://localhost:4001/foobar

# Список продуктов (первый запрос MISS, второй HIT за счёт кэша)
curl -i http://localhost:4001/product/products
curl -i http://localhost:4001/product/products

# Корзина (требует Basic auth у cart-api)
TOKEN=$(echo -n 'user:password' | base64)
curl -i -H "Authorization: Basic $TOKEN" http://localhost:4001/cart/profile/cart
```

## Кэш (`getProductsList`, +20 баллов)

В памяти кэшируется **только** `GET /product/products` (без `?query`, без `/{id}`) с TTL 2 минуты. Запись (POST/PUT/DELETE) **не** инвалидирует кэш — спека требует именно TTL-семантики:

```
GET  /product/products      -> [A, B, C]            (MISS, сохранили)
POST /product/products  ... -> 201
GET  /product/products      -> [A, B, C]            (HIT, новый продукт пока не виден)
... wait 2 минуты ...
GET  /product/products      -> [A, B, C, NEW]       (TTL истёк, заново подтянули)
```

EB-окружение поднимается с флагом `--single` (один инстанс, без LB) — in-memory Map когерентен.

## Deploy на Elastic Beanstalk (Docker single-container)

```bash
cd bff-service
eb init feodorius-bff-api --platform docker --region eu-north-1
eb create feodorius-bff-api-prod --single --cname feodorius-bff-api-prod
eb setenv \
  product=https://pspuitbq9k.execute-api.eu-north-1.amazonaws.com/prod \
  import=https://wsh6kss9u5.execute-api.eu-north-1.amazonaws.com/prod \
  cart=http://feodorius-cart-api-prod.<eb-hash>.eu-north-1.elasticbeanstalk.com \
  PORT=80
eb deploy
```

URL получится `http://feodorius-bff-api-prod.<hash>.eu-north-1.elasticbeanstalk.com`.

## Архитектурные заметки

- **`undici`** в качестве HTTP-клиента. Уже встроен в Node 20, не тянет Express-родственников, нативный Buffer/stream.
- **Универсальный body-parser**: Fastify настроен принимать любой `Content-Type` как `Buffer`, чтобы пересылать тело байт-в-байт (важно для JSON-схем и multipart).
- **Hop-by-hop заголовки** (`host`, `content-length`, `connection`, …) сбрасываются на обе стороны.
- **CORS**: BFF сам выставляет `Access-Control-Allow-*`, заголовки upstream-а с тем же префиксом отбрасываются, чтобы браузер не получал дублей.
- **Health-check**: `GET /` возвращает 200 — EB не помечает env как Severe.

## Запрещённые зависимости

`express`, `@nestjs/platform-express`, `helmet` — отсутствуют (Express даёт −50 баллов в этой задаче).
