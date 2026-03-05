const CACHE_KEY = "flowtime_weather_cache";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export interface DailyForecast {
  date: string;
  max: number;
  min: number;
  code: number;
  icon: string;
  description: string;
  precip: number;
  wind: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
  humidity?: number;
  windSpeed?: number;
  daily: DailyForecast[];
}

interface CachedWeather {
  data: WeatherData;
  timestamp: number;
}

const WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: "Ciel degage", icon: "☀️" },
  1: { description: "Peu nuageux", icon: "🌤️" },
  2: { description: "Partiellement nuageux", icon: "⛅" },
  3: { description: "Couvert", icon: "☁️" },
  45: { description: "Brouillard", icon: "🌫️" },
  48: { description: "Brouillard givrant", icon: "🌫️" },
  51: { description: "Bruine legere", icon: "🌦️" },
  53: { description: "Bruine", icon: "🌦️" },
  55: { description: "Bruine dense", icon: "🌦️" },
  61: { description: "Pluie legere", icon: "🌧️" },
  63: { description: "Pluie", icon: "🌧️" },
  65: { description: "Pluie forte", icon: "🌧️" },
  66: { description: "Pluie verglacante", icon: "🌧️" },
  67: { description: "Pluie verglacante forte", icon: "🌧️" },
  71: { description: "Neige legere", icon: "🌨️" },
  73: { description: "Neige", icon: "🌨️" },
  75: { description: "Neige forte", icon: "❄️" },
  77: { description: "Grains de neige", icon: "❄️" },
  80: { description: "Averses legeres", icon: "🌦️" },
  81: { description: "Averses", icon: "🌧️" },
  82: { description: "Averses violentes", icon: "⛈️" },
  85: { description: "Averses de neige", icon: "🌨️" },
  86: { description: "Averses de neige fortes", icon: "❄️" },
  95: { description: "Orage", icon: "⛈️" },
  96: { description: "Orage avec grele", icon: "⛈️" },
  99: { description: "Orage violent avec grele", icon: "⛈️" },
};

export { WEATHER_CODES };

function getCached(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedWeather = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_DURATION) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function setCache(data: WeatherData) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
}

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const cached = getCached();
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weathercode,relative_humidity_2m,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,wind_speed_10m_max,sunrise,sunset` +
      `&forecast_days=7&timezone=auto`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const code = json.current?.weathercode ?? 0;
    const info = WEATHER_CODES[code] || { description: "Inconnu", icon: "🌡️" };

    const daily: DailyForecast[] = [];
    const d = json.daily;
    if (d?.time) {
      for (let i = 0; i < d.time.length; i++) {
        const dayCode = d.weathercode?.[i] ?? 0;
        const dayInfo = WEATHER_CODES[dayCode] || { description: "Inconnu", icon: "🌡️" };
        daily.push({
          date: d.time[i],
          max: Math.round(d.temperature_2m_max?.[i] ?? 0),
          min: Math.round(d.temperature_2m_min?.[i] ?? 0),
          code: dayCode,
          icon: dayInfo.icon,
          description: dayInfo.description,
          precip: d.precipitation_sum?.[i] ?? 0,
          wind: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
          sunrise: d.sunrise?.[i] ?? "",
          sunset: d.sunset?.[i] ?? "",
        });
      }
    }

    const data: WeatherData = {
      temperature: Math.round(json.current?.temperature_2m ?? 0),
      weatherCode: code,
      description: info.description,
      icon: info.icon,
      humidity: json.current?.relative_humidity_2m,
      windSpeed: json.current?.wind_speed_10m ? Math.round(json.current.wind_speed_10m) : undefined,
      daily,
    };
    setCache(data);
    return data;
  } catch {
    return null;
  }
}

export async function getWeatherWithGeolocation(
  profileLat?: number | null,
  profileLng?: number | null
): Promise<WeatherData | null> {
  // Try cached first
  const cached = getCached();
  if (cached) return cached;

  // Use profile coords if available
  if (profileLat && profileLng) {
    return fetchWeather(profileLat, profileLng);
  }

  // Fallback to browser geolocation
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(fetchWeather(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}
