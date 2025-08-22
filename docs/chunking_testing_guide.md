# Testando o Sistema de Chunking do GeminiService

Este documento demonstra como testar as novas funcionalidades de chunking do sistema de tradução.

## Endpoints Disponíveis para Teste

### 1. **Estatísticas de Tradução**

```http
GET /api/utils/translation-stats
```

**Resposta:**

```json
{
  "success": true,
  "data": {
    "translation": {
      "cacheSize": 15,
      "chunkedTranslations": 3,
      "estimatedTokensSaved": 1250
    },
    "quota": {
      "dailyRequestsUsed": 25,
      "dailyRequestsRemaining": 155,
      "rateLimitHit": false,
      "consecutiveFailures": 0,
      "canMakeRequest": true
    },
    "timestamp": "2025-08-21T10:30:00.000Z"
  }
}
```

### 2. **Limpeza Forçada de Cache**

```http
POST /api/utils/force-clean-cache
Content-Type: application/json

{
  "maxAge": 6  // em horas (opcional, padrão: 12h)
}
```

### 3. **Teste de Tradução Simples**

```http
POST /api/utils/test-translation
Content-Type: application/json

{
  "text": "Olá mundo",
  "targetLanguage": "en",
  "sourceLanguage": "pt"
}
```

### 4. **Teste de Tradução com Chunking**

```http
POST /api/utils/test-translation
Content-Type: application/json

{
  "text": "Este é um teste de chunking",
  "targetLanguage": "en",
  "sourceLanguage": "pt",
  "testChunking": true  // Força criação de objeto grande
}
```

**Resposta (Chunking):**

```json
{
  "success": true,
  "data": {
    "original": {
      "title": "Este é um teste de chunking",
      "descriptions": [
        "Este é um teste de chunking - Descrição 1",
        "Este é um teste de chunking - Descrição 2"
        // ... mais 8 itens
      ],
      "content": {
        "main": "Este é um teste de chunking",
        "secondary": [
          {
            "title": "Seção 1",
            "content": "Este é um teste de chunking - Conteúdo da seção 1"
          }
          // ... mais 4 seções
        ]
      }
    },
    "translated": {
      // Objeto traduzido com mesma estrutura
    },
    "performance": {
      "duration": "2450ms",
      "chunked": true,
      "estimatedTokens": 245
    },
    "quotaStatus": {
      // Status da quota atual
    },
    "translationStats": {
      // Estatísticas do cache/chunking
    }
  }
}
```

## Cenários de Teste Recomendados

### 1. **Teste de Performance**

1. Faça uma tradução grande com `testChunking: true`
2. Faça a mesma tradução novamente
3. Compare os tempos - a segunda deve ser muito mais rápida (cache hit)

### 2. **Teste de Chunking Automático**

Crie um objeto manual muito grande:

```http
POST /api/utils/test-translation
{
  "text": "Texto longo aqui...",
  "targetLanguage": "fr",
  "testChunking": true
}
```

### 3. **Monitoramento de Quota**

```bash
# Verifique antes
curl GET /api/utils/quota-status

# Faça várias traduções
curl POST /api/utils/test-translation -d '{...}'

# Verifique depois
curl GET /api/utils/translation-stats
```

### 4. **Teste de Cache Hierárquico**

1. Traduza um objeto grande (será dividido em chunks)
2. Modifique ligeiramente e traduza novamente
3. Observe que partes são cache hit e partes são novas

## Comandos de Teste via cURL

```bash
# Estatísticas
curl -X GET http://localhost:3000/api/utils/translation-stats

# Teste simples
curl -X POST http://localhost:3000/api/utils/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text": "Olá mundo", "targetLanguage": "en"}'

# Teste com chunking
curl -X POST http://localhost:3000/api/utils/test-translation \
  -H "Content-Type: application/json" \
  -d '{"text": "Teste de objeto grande", "targetLanguage": "en", "testChunking": true}'

# Limpeza de cache
curl -X POST http://localhost:3000/api/utils/force-clean-cache \
  -H "Content-Type: application/json" \
  -d '{"maxAge": 1}'
```

## Monitoramento em Produção

### Métricas Importantes

- **cacheSize**: Número total de entradas no cache
- **chunkedTranslations**: Quantas traduções foram divididas
- **estimatedTokensSaved**: Economia estimada através do cache
- **dailyRequestsUsed**: Uso da quota diária

### Alertas Recomendados

- Cache > 1000 entradas (considerar limpeza)
- Quota > 80% (rate limiting)
- Muitas falhas consecutivas (problemas na API)

### Otimização Contínua

1. Monitore `chunkedTranslations` vs traduções normais
2. Ajuste `MAX_CHUNK_SIZE` baseado nos dados reais
3. Otimize cache TTL baseado nos padrões de uso
4. Considere persistência do cache se houver múltiplas instâncias
