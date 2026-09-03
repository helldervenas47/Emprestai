import { useState, useEffect, useMemo } from "react";

const CACHE_KEY = "brazilian_cities_v1";

// Cidades mais comuns para resposta instantânea offline (0ms)
const DEFAULT_CITIES = [
  "São Gonçalo dos Campos - BA",
  "Feira de Santana - BA",
  "Salvador - BA",
  "Camaçari - BA",
  "Lauro de Freitas - BA",
  "Vitória da Conquista - BA",
  "Itabuna - BA",
  "Ilhéus - BA",
  "Juazeiro - BA",
  "Jequié - BA",
  "Alagoinhas - BA",
  "Porto Seguro - BA",
  "Simões Filho - BA",
  "Teixeira de Freitas - BA",
  "Barreiras - BA",
  "Paulo Afonso - BA",
  "Santo Antônio de Jesus - BA",
  "Valença - BA",
  "Candeias - BA",
  "Guanambi - BA",
  "Jacobina - BA",
  "Serrinha - BA",
  "Senhor do Bonfim - BA",
  "Dias d'Ávila - BA",
  "Luís Eduardo Magalhães - BA",
  "Itapetinga - BA",
  "Irecê - BA",
  "Cruz das Almas - BA",
  "Conceição do Coité - BA",
  "São Paulo - SP",
  "Rio de Janeiro - RJ",
  "Belo Horizonte - MG",
  "Brasília - DF",
  "Curitiba - PR",
  "Fortaleza - CE",
  "Recife - PE",
  "Goiânia - GO",
  "Belém - PA",
  "Manaus - AM",
  "Porto Alegre - RS",
  "Aracaju - SE",
  "Maceió - AL",
  "Natal - RN",
  "João Pessoa - PB",
  "Teresina - PI",
  "São Luís - MA",
  "Cuiabá - MT",
  "Campo Grande - MS",
  "Florianópolis - SC",
  "Vitória - ES",
  "Palmas - TO",
  "Boa Vista - RR",
  "Porto Velho - RO",
  "Rio Branco - AC",
  "Macapá - AP",
];

export function normalizeText(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function searchCities(query: string, cities: string[], limit = 40): string[] {
  const normQuery = normalizeText(query);
  if (!normQuery) return cities.slice(0, limit);

  // Divide a query em termos (ex: "sao goncalo ba")
  const terms = normQuery.split(/\s+/).filter(Boolean);

  const matched: string[] = [];
  for (const city of cities) {
    const normCity = normalizeText(city);
    const matchesAll = terms.every((t) => normCity.includes(t));
    if (matchesAll) {
      matched.push(city);
      if (matched.length >= limit) break;
    }
  }

  return matched;
}

export function useBrazilianCities() {
  const [cities, setCities] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_CITIES;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadIbgeCities() {
      // Se já temos a base completa em cache (mais de 1000 cidades), não precisa refazer o fetch
      if (cities.length > 1000) return;

      try {
        setLoading(true);
        const res = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && active) {
          const formatted = data
            .map((item: any) => {
              const nome = item.nome;
              const uf = item.microrregiao?.mesorregiao?.UF?.sigla || item["UF-sigla"] || "";
              return uf ? `${nome} - ${uf}` : nome;
            })
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "pt-BR"));

          setCities(formatted);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(formatted));
          } catch {
            // Se exceder a cota de storage, mantém em memória
          }
        }
      } catch {
        // Fallback silencioso para DEFAULT_CITIES
      } finally {
        if (active) setLoading(false);
      }
    }

    loadIbgeCities();

    return () => {
      active = false;
    };
  }, []);

  return { cities, loading };
}
