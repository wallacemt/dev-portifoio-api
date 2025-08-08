# Sistema de Analytics do Portfólio

Este documento explica como integrar o sistema de analytics no frontend do seu portfólio.

## Como Funciona

O sistema de analytics coleta dados de visitantes e visualizações de página para gerar métricas detalhadas sobre o seu portfólio.

### 1. Rastreamento de Visitantes

Quando um usuário acessa seu portfólio pela primeira vez, você deve registrá-lo:

```javascript
// Exemplo de como registrar um visitante
const trackVisitor = async () => {
  try {
    const sessionId = generateSessionId(); // Gere um ID único para a sessão
    const deviceInfo = getDeviceInfo(); // Detecte informações do dispositivo

    const response = await fetch(`/api/analytics/${ownerId}/track-visitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        userAgent: navigator.userAgent,
        country: await getCountry(), // Use uma API de geolocalização
        city: await getCity(),
        device: deviceInfo.device, // 'desktop', 'mobile', ou 'tablet'
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        referrer: document.referrer,
        landingPage: window.location.pathname,
      }),
    });

    if (response.ok) {
      // Salve o sessionId no localStorage para uso posterior
      localStorage.setItem("portfolioSessionId", sessionId);
    }
  } catch (error) {
    console.error("Erro ao registrar visitante:", error);
  }
};

// Função auxiliar para detectar dispositivo
const getDeviceInfo = () => {
  const width = window.innerWidth;
  let device = "desktop";

  if (width <= 768) device = "mobile";
  else if (width <= 1024) device = "tablet";

  return {
    device,
    browser: getBrowserName(),
    os: getOSName(),
  };
};

// Função para gerar ID de sessão único
const generateSessionId = () => {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
};
```

### 2. Rastreamento de Visualizações de Página

Para cada página visitada, registre a visualização:

```javascript
// Rastrear visualização de página
const trackPageView = async (page, timeSpent = null) => {
  try {
    const sessionId = localStorage.getItem("portfolioSessionId");
    if (!sessionId) {
      console.warn("Session ID não encontrado. Registre o visitante primeiro.");
      return;
    }

    await fetch(`/api/analytics/${ownerId}/track-pageview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        page,
        timeSpent, // em segundos
      }),
    });
  } catch (error) {
    console.error("Erro ao registrar visualização:", error);
  }
};

// Exemplo de uso com React Router
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const AnalyticsTracker = () => {
  const location = useLocation();
  const [startTime, setStartTime] = useState(Date.now());

  useEffect(() => {
    // Rastrear nova página
    const newStartTime = Date.now();
    setStartTime(newStartTime);

    trackPageView(location.pathname);

    // Cleanup: registrar tempo gasto na página anterior
    return () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      if (timeSpent > 0) {
        trackPageView(location.pathname, timeSpent);
      }
    };
  }, [location.pathname]);

  return null;
};
```

### 3. Hook React para Analytics

```javascript
// hooks/useAnalytics.js
import { useEffect, useCallback } from "react";

export const useAnalytics = (ownerId) => {
  // Inicializar rastreamento de visitante
  const initializeTracking = useCallback(async () => {
    const existingSessionId = localStorage.getItem("portfolioSessionId");

    if (!existingSessionId) {
      await trackVisitor();
    }
  }, []);

  // Rastrear página
  const trackPage = useCallback((page, timeSpent) => {
    trackPageView(page, timeSpent);
  }, []);

  useEffect(() => {
    initializeTracking();
  }, [initializeTracking]);

  return { trackPage };
};

// Uso do hook
const App = () => {
  const { trackPage } = useAnalytics("SEU_OWNER_ID");

  // ... resto do componente
};
```

## APIs Privadas (Admin)

Para visualizar as analytics no painel administrativo:

### 1. Dashboard Completo

```javascript
// Buscar analytics completas
const getAnalytics = async (filters = {}) => {
  try {
    const queryParams = new URLSearchParams();

    if (filters.startDate) queryParams.append("startDate", filters.startDate);
    if (filters.endDate) queryParams.append("endDate", filters.endDate);
    if (filters.device) queryParams.append("device", filters.device);
    if (filters.country) queryParams.append("country", filters.country);

    const response = await fetch(`/api/analytics/private/dashboard?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar analytics:", error);
  }
};

// Exemplo de uso
const analytics = await getAnalytics({
  startDate: "2024-04-01",
  endDate: "2024-04-30",
  device: "mobile",
});

console.log(analytics);
/*
{
  "overview": {
    "totalVisitors": 1500,
    "uniqueVisitors": 1200,
    "pageViews": 3500,
    "bounceRate": 35.5,
    "avgTimeSpent": 180
  },
  "deviceBreakdown": {
    "desktop": 800,
    "mobile": 600,
    "tablet": 100
  },
  "dailyStats": [
    {
      "date": "2024-04-01",
      "desktop": 222,
      "mobile": 150,
      "tablet": 28
    }
  ],
  "topPages": [
    { "page": "/projects", "views": 450 }
  ],
  "topCountries": [
    { "country": "Brazil", "visitors": 850 }
  ]
}
*/
```

### 2. Resumo para Dashboard

```javascript
// Buscar resumo rápido
const getAnalyticsSummary = async () => {
  try {
    const response = await fetch("/api/analytics/private/summary", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar resumo:", error);
  }
};
```

### 3. Analytics em Tempo Real

```javascript
// Buscar dados em tempo real
const getRealTimeAnalytics = async () => {
  try {
    const response = await fetch("/api/analytics/private/realtime", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar dados em tempo real:", error);
  }
};

// Atualizar a cada 30 segundos
useEffect(() => {
  const interval = setInterval(() => {
    getRealTimeAnalytics().then(setRealTimeData);
  }, 30000);

  return () => clearInterval(interval);
}, []);
```

## Componentes de Exemplo

### Dashboard de Analytics

```jsx
import React, { useState, useEffect } from "react";
import { Line, Doughnut } from "react-chartjs-2";

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [realTime, setRealTime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [analyticsData, realTimeData] = await Promise.all([getAnalytics(), getRealTimeAnalytics()]);

        setAnalytics(analyticsData);
        setRealTime(realTimeData);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="analytics-dashboard">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Visitantes Únicos</h3>
          <p>{analytics.overview.uniqueVisitors}</p>
        </div>

        <div className="stat-card">
          <h3>Visualizações</h3>
          <p>{analytics.overview.pageViews}</p>
        </div>

        <div className="stat-card">
          <h3>Taxa de Rejeição</h3>
          <p>{analytics.overview.bounceRate.toFixed(1)}%</p>
        </div>

        <div className="stat-card">
          <h3>Visitantes Ativos</h3>
          <p>{realTime.activeVisitors}</p>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h4>Visitantes por Dispositivo</h4>
          <Doughnut
            data={{
              labels: ["Desktop", "Mobile", "Tablet"],
              datasets: [
                {
                  data: [
                    analytics.deviceBreakdown.desktop,
                    analytics.deviceBreakdown.mobile,
                    analytics.deviceBreakdown.tablet,
                  ],
                  backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56"],
                },
              ],
            }}
          />
        </div>

        <div className="chart-container">
          <h4>Visitantes Diários</h4>
          <Line
            data={{
              labels: analytics.dailyStats.map((stat) => stat.date),
              datasets: [
                {
                  label: "Visitantes",
                  data: analytics.dailyStats.map((stat) => stat.uniqueVisitors),
                  borderColor: "#36A2EB",
                  fill: false,
                },
              ],
            }}
          />
        </div>
      </div>
    </div>
  );
};
```

## Configuração Inicial

1. **No componente raiz da aplicação**, inicialize o rastreamento:

```jsx
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    // Inicializar analytics quando a aplicação carrega
    const initAnalytics = async () => {
      await trackVisitor();
    };

    initAnalytics();
  }, []);

  return (
    <Router>
      <AnalyticsTracker />
      {/* Resto da aplicação */}
    </Router>
  );
};
```

2. **Configure variáveis de ambiente**:

```env
VITE_API_URL=http://localhost:8081
VITE_OWNER_ID=seu_owner_id_aqui
```

## Considerações de Privacidade

- O sistema não coleta dados pessoais identificáveis
- IPs são usados apenas para geolocalização aproximada
- Os dados são agregados para análise estatística
- Considere adicionar um aviso de cookies/privacy policy

## Próximos Passos

1. Implemente as funções de rastreamento no seu frontend
2. Configure o dashboard administrativo
3. Teste as APIs usando a documentação Swagger em `/docs`
4. Configure alertas para métricas importantes
5. Adicione filtros avançados conforme necessário
