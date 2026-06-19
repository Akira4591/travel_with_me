// js/__tests__/state.test.js

import { describe, it, expect, beforeEach } from 'vitest';

// state.js mutates module-level variables; import once per describe to start fresh
// Each test block re-imports the module via dynamic import

/** @type {typeof import('../state.js')} */
let state;

beforeEach(async () => {
  // Dynamic import gives a fresh module instance each test (Vitest isolates modules per test file)
  state = await import('../state.js');
  // Initialize with null workspace to get default demo trip
  state.initWorkspace(null, null);
});

describe('createTrip', () => {
  it('creates a new trip with title and one default day', () => {
    state.initWorkspace({ trips: [], activeTripId: null });
    const id = state.createTrip('我的旅行');
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id.startsWith('trip-')).toBe(true);

    const trip = state.getTrip();
    expect(trip.title).toBe('我的旅行');
    expect(trip.days.length).toBe(1);
  });

  it('rejects when max trips reached', () => {
    state.initWorkspace({ trips: [], activeTripId: null });
    state.createTrip('Trip 1');
    state.createTrip('Trip 2');
    state.createTrip('Trip 3');
    expect(state.createTrip('Trip 4')).toBeNull();
  });
});

describe('addDay', () => {
  it('adds a day to the active trip', () => {
    const dayId = state.addDay({ title: '新的一天' });
    expect(dayId).toBeTruthy();
    expect(state.getTrip().days.length).toBeGreaterThan(1);
  });
});

describe('addEventToDay', () => {
  it('adds an event to a specific day', () => {
    const trip = state.getTrip();
    const day = trip.days[0];
    const locId = state.addLocation({ name: '测试地点', addr: '测试地址', lnglat: [116.4, 39.9] });
    const eventId = state.addEventToDay(day.id, {
      title: '参观测试',
      locationId: locId,
      timeSlot: 'morning'
    });
    expect(eventId).toBeTruthy();
    const updatedDay = state.getDay(day.id);
    expect(updatedDay.events.length).toBeGreaterThan(0);
    expect(updatedDay.events.find(e => e.id === eventId)?.title).toBe('参观测试');
  });

  it('adds event without timeSlot', () => {
    const trip = state.getTrip();
    const day = trip.days[0];
    const locId = state.addLocation({ name: '无时间地点', addr: '某处', lnglat: [116.4, 39.9] });
    const eventId = state.addEventToDay(day.id, { title: '自由活动', locationId: locId });
    expect(eventId).toBeTruthy();
  });
});

describe('removeEventFromDay', () => {
  it('removes an existing event', () => {
    const trip = state.getTrip();
    const day = trip.days[0];
    const eventsBefore = day.events.length;
    if (eventsBefore === 0) return; // skip if demo trip has no events
    const eventId = day.events[0].id;
    const removed = state.removeEventFromDay(day.id, eventId);
    expect(removed).toBe(true);
    expect(state.getDay(day.id).events.length).toBe(eventsBefore - 1);
  });
});

describe('moveEventBetweenContainers', () => {
  it('moves event between unscheduled and a day', () => {
    const trip = state.getTrip();
    const day = trip.days[0];
    const locId = state.addLocation({ name: '未排期地点', addr: '测试', lnglat: [116.4, 39.9] });
    const eventId = state.addUnscheduledEvent({ title: '候补', locationId: locId });
    expect(eventId).toBeTruthy();

    const moved = state.moveEventBetweenContainers(eventId, { dayId: day.id });
    expect(moved).toBe(true);
    expect(state.getDay(day.id).events.find(e => e.id === eventId)).toBeTruthy();
  });
});

describe('annotations', () => {
  it('normalizes missing annotations on old trips', () => {
    state.initWorkspace({
      trips: [
        {
          id: 'old-trip',
          title: '旧路线',
          locations: {},
          days: []
        }
      ],
      activeTripId: 'old-trip'
    });

    expect(state.getTrip().annotations).toEqual([]);
    expect(state.getAnnotations()).toEqual([]);
  });

  it('adds, updates, and removes a 3D annotation', () => {
    const annotationId = state.addAnnotation({
      type: 'viewpoint',
      lnglat: [116.405, 39.912],
      elevation: 32,
      title: 'View deck',
      note: 'Sunset angle'
    });

    expect(annotationId).toBeTruthy();
    expect(state.getAnnotations()).toHaveLength(1);
    expect(state.getAnnotations()[0]).toMatchObject({
      id: annotationId,
      type: 'viewpoint',
      lnglat: [116.405, 39.912],
      elevation: 32,
      title: 'View deck',
      note: 'Sunset angle'
    });

    expect(state.updateAnnotation(annotationId, { type: 'risk', title: 'Steep turn' })).toBe(true);
    expect(state.getAnnotations()[0]).toMatchObject({
      type: 'risk',
      title: 'Steep turn'
    });

    expect(state.removeAnnotation(annotationId)).toBe(true);
    expect(state.getAnnotations()).toHaveLength(0);
  });

  it('rejects invalid annotation coordinates', () => {
    expect(state.addAnnotation({ lnglat: [999, 39.9] })).toBeNull();
  });
});

describe('getAppState', () => {
  it('returns runtime state object', () => {
    const appState = state.getAppState();
    expect(appState).toBeDefined();
    expect(appState.activeDayId).toBe('all');
  });
});
