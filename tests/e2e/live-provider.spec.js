import { expect, test } from '@playwright/test';

test.describe('@live-provider live provider smoke', () => {
  test.skip(process.env.LIVE_PROVIDER !== '1', 'Live provider smoke is explicit opt-in only.');

  test('BFF readiness and AMap geocode proxy are healthy', async ({ request }) => {
    const ready = await request.get('/readyz');
    expect(ready.status()).toBe(200);
    const readyBody = await ready.json();
    expect(readyBody.status).toBe('ready');
    expect(readyBody.dependencies.amapWebService).toBe(true);
    expect(readyBody.dependencies.amapJsSecurity).toBe(true);

    const geocode = await request.get('/_AMapService/v3/geocode/geo', {
      params: {
        address: '北京市东城区',
        city: '北京'
      }
    });
    expect(geocode.status()).toBe(200);
    const geocodeBody = await geocode.json();
    expect(String(geocodeBody.status)).toBe('1');
  });
});
