# Gemini API - Gerenciamento de Quota e Cache

## Resumo das Melhorias Implementadas

Para resolver o problema de excesso de quota da API do Gemini (erro 429), implementei uma solução completa com múltiplas camadas de proteção:

### 1. **Sistema de Cache Inteligente**

- Cache automático de 24 horas para traduções
- Evita chamadas desnecessárias para o mesmo conteúdo
- Limpeza automática de cache expirado

### 2. **Gerenciamento de Quota (`QuotaManager`)**

- Limite conservador de 180 requests/dia (deixando 20 de buffer)
- Intervalo mínimo de 1 segundo entre requests
- Monitoramento de falhas consecutivas
- Reset automático diário das métricas

### 3. **Sistema de Retry com Exponential Backoff**

- Até 3 tentativas com delays crescentes
- Extração automática do delay sugerido pela API
- Graceful fallback para objeto original em caso de quota esgotada

### 4. **Endpoints de Monitoramento**

- `GET /api/utils/quota-status` - Status da quota e cache
- `POST /api/utils/clear-cache` - Limpar cache e métricas
- `POST /api/utils/test-translation` - Testar tradução com monitoramento

## Como Usar

### Uso Normal (Automático)

```typescript
const translationService = new TranslationService();
const result = await translationService.translateObject({ title: "Olá mundo" }, "en", "pt");
// Sistema automaticamente:
// 1. Verifica cache
// 2. Valida quota
// 3. Faz retry se necessário
// 4. Retorna original se quota esgotada
```

### Monitoramento via API

```bash
# Verificar status da quota
curl GET /api/utils/quota-status

# Limpar cache em emergência
curl -X POST /api/utils/clear-cache

# Testar tradução
curl -X POST /api/utils/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "targetLanguage": "pt"}'
```

### Exemplo de Resposta do Status

```json
{
  "success": true,
  "data": {
    "quota": {
      "dailyRequestsUsed": 45,
      "dailyRequestsRemaining": 135,
      "rateLimitHit": false,
      "consecutiveFailures": 0,
      "canMakeRequest": true
    },
    "cache": {
      "size": 12,
      "entries": [...]
    },
    "timestamp": "2025-01-26T10:30:00.000Z"
  }
}
```

## Benefícios da Solução

1. **Prevenção Proativa**: Evita atingir o limite antes que aconteça
2. **Resilência**: Sistema continua funcionando mesmo com quota esgotada
3. **Performance**: Cache reduz latência e uso de API
4. **Monitoramento**: Visibilidade completa do uso da quota
5. **Manutenibilidade**: Fácil de ajustar limites e comportamentos

## Configurações Ajustáveis

No `QuotaManager.ts`, você pode ajustar:

- `MAX_DAILY_REQUESTS`: Limite diário (padrão: 180)
- `MIN_REQUEST_INTERVAL`: Intervalo entre requests (padrão: 1000ms)
- `MAX_CONSECUTIVE_FAILURES`: Máximo de falhas consecutivas (padrão: 3)

No `TranslationService.ts`:

- `CACHE_DURATION`: Duração do cache (padrão: 24h)
- `MAX_RETRIES`: Tentativas máximas (padrão: 3)
- `BASE_DELAY`: Delay base para retry (padrão: 1000ms)

Esta solução garante que você nunca mais tenha problemas de quota, mantendo a funcionalidade da aplicação mesmo em situações extremas.
