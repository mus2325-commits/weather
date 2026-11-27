/**
 * 1. 브라우저 Geolocation API로 현재 실시간 위치(위도, 경도) 가져오기
 */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 정보(GPS)를 지원하지 않습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: Number(position.coords.latitude.toFixed(4)),
          lng: Number(position.coords.longitude.toFixed(4))
        });
      },
      (error) => {
        let message = '위치 정보를 가져올 수 없습니다.';
        if (error.code === error.PERMISSION_DENIED) {
          message = '위치 권한이 거부되었습니다. 브라우저 주소창 왼쪽 아이콘에서 위치 권한을 허용해주세요.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = '현재 위치 정보를 사용할 수 없습니다.';
        } else if (error.code === error.TIMEOUT) {
          message = '위치 확인 시간이 초과되었습니다.';
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

/**
 * 2. 위도/경도를 '서울 은평구', '부산 해운대구' 형태의 한글 지역명으로 변환
 */
async function getKoreanRegionName(lat, lng) {
  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`;
    const response = await fetch(geoUrl);
    if (!response.ok) throw new Error('지역명 조회 실패');

    const data = await response.json();
    const addr = data.address || {};

    const rawCity = addr.city || addr.province || addr.state || '';
    const shortCity = rawCity
      .replace('특별시', '')
      .replace('광역시', '')
      .replace('특별자치시', '')
      .replace('특별자치도', '')
      .trim();

    const district = addr.borough || addr.district || addr.county || addr.suburb || addr.town || '';

    const fullRegion = `${shortCity} ${district}`.trim();
    return fullRegion || `내 위치 (${lat}, ${lng})`;
  } catch (error) {
    console.warn('역지오코딩 실패로 좌표를 대신 표시합니다:', error);
    return `내 위치 (${lat}, ${lng})`;
  }
}

function formatKoreanTime(isoString) {
  const date = new Date(isoString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `기준 ${hours}:${minutes}`;
}

function getSimpleCondition(precip, snow) {
  if (snow > 0) return '눈';
  if (precip > 0.5) return '비';
  return '현재 기상';
}

/**
 * 3. 실시간 위치 기반으로 지역명 + 날씨 + 해양 데이터 동시 요청
 */
async function updateRealtimeWeather() {
  const refreshBtn = document.getElementById('refresh-btn');

  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '위치 확인 중...';

    const { lat, lng } = await getCurrentLocation();

    refreshBtn.textContent = '날씨 로딩 중...';

    const weatherParams = [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'surface_pressure',
      'snow_depth',
      'visibility',
      'uv_index'
    ].join(',');

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=${weatherParams}&timezone=auto`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height&timezone=auto`;

    const [regionName, weatherRes, marineRes] = await Promise.all([
      getKoreanRegionName(lat, lng),
      fetch(weatherUrl),
      fetch(marineUrl)
    ]);

    if (!weatherRes.ok) {
      throw new Error(`기상 API 요청 실패 (상태 코드: ${weatherRes.status})`);
    }

    const weatherData = await weatherRes.json();
    const marineData = marineRes.ok ? await marineRes.json() : null;

    const current = weatherData.current;
    const temp = current.temperature_2m;
    const humidity = current.relative_humidity_2m;
    const precipitation = current.precipitation ?? 0;
    const pressure = current.surface_pressure;
    const snowDepth = current.snow_depth ?? 0;
    const visibilityKm = current.visibility !== null ? current.visibility / 1000 : null;
    const uvIndex = current.uv_index;
    const waveHeight = marineData?.current?.wave_height ?? null;

    console.log(`📍 감지된 행정구역: ${regionName} (${lat}, ${lng})`);
    console.table({
      지역: regionName,
      기준시각: current.time,
      기온: `${temp} °C`,
      습도: `${humidity} %`,
      강수량: `${precipitation} mm/h`,
      기압: `${pressure} hPa`,
      적설량: `${snowDepth} m`,
      가시거리: visibilityKm !== null ? `${visibilityKm.toFixed(1)} km` : '데이터 없음',
      UV지수: uvIndex,
      파도높이: waveHeight !== null ? `${waveHeight} m` : '내륙(없음)'
    });

    // DOM 화면 업데이트
    document.getElementById('city-name').textContent = regionName;
    document.getElementById('current-temp').textContent = temp !== null ? `${Math.round(temp)}°` : '--°';
    document.getElementById('weather-status').textContent = getSimpleCondition(precipitation, snowDepth);
    document.getElementById('base-time').textContent = formatKoreanTime(current.time);

    document.getElementById('humidity-value').textContent = humidity !== null ? `${Math.round(humidity)} %` : '-- %';
    document.getElementById('precip-value').textContent = `${precipitation.toFixed(1)} mm/h`;
    document.getElementById('pressure-value').textContent = pressure !== null ? `${Math.round(pressure)} hPa` : '-- hPa';
    document.getElementById('snow-value').textContent = `${snowDepth.toFixed(1)} m`;
    document.getElementById('visibility-value').textContent = visibilityKm !== null ? `${visibilityKm.toFixed(1)} km` : '-- km';
    document.getElementById('uv-value').textContent = uvIndex !== null ? uvIndex.toFixed(1) : '--';
    document.getElementById('wave-value').textContent = waveHeight !== null ? `${waveHeight.toFixed(1)} m` : '내륙(없음)';

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    alert(error.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '새로고침';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateRealtimeWeather();
  document.getElementById('refresh-btn').addEventListener('click', updateRealtimeWeather);
});