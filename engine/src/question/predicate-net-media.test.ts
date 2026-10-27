import { describe, it, expect } from 'vitest';
import { EventType } from '@reticlehq/core';
import type { ReticleEvent } from '@reticlehq/core';
import { evalNet } from './predicate/predicate-eval.js';
import { PredicateKind } from './predicate/predicate.js';

/**
 * A media element's load is not a missing request.
 *
 * `<video src>` / `<audio src>` / `<track src>` loads reach neither the patched `fetch` and
 * `XMLHttpRequest` nor the `resource` timing entries (Chromium does not report media element loads
 * as `resource` entries), so a `net` clause over a media file can never be matched by the page
 * playing it. Graded `no`, it sends an agent to fix a video that plays (#1664).
 */
function netEvent(t: number, data: Record<string, unknown>): ReticleEvent {
  return { type: EventType.NET_REQUEST, t, data } as ReticleEvent;
}

const API_CALL = netEvent(10, { method: 'GET', url: '/api/session', status: 200, ok: true });
// A document-initiated resource entry proves the resource-timing observer is live on the page.
const IMAGE_ENTRY = netEvent(11, {
  method: 'GET',
  url: '/img/logo.png',
  status: 200,
  ok: true,
  initiator: 'img',
});

describe('evalNet — media element loads', () => {
  it.each([
    '/media/clip.mp4',
    '/media/clip.webm',
    '/media/live/index.m3u8',
    '/media/song.mp3',
    '/media/captions.vtt',
    '/media/clip.mp4?token=abc',
  ])('reports a miss on %s as inconclusive, even when resource timing is live', (urlContains) => {
    const r = evalNet([API_CALL, IMAGE_ENTRY], { kind: PredicateKind.NET, urlContains });

    expect(r.pass).toBe(false);
    expect(r.inconclusive).toBeDefined();
    expect(r.inconclusive).toContain('media');
    expect(r.inconclusive).toContain('element');
    expect(r.assertion).toBe('net.media-load');
  });

  it('applies to a count clause too', () => {
    const r = evalNet([API_CALL, IMAGE_ENTRY], {
      kind: PredicateKind.NET,
      urlContains: '/media/clip.mp4',
      count: 1,
    });

    expect(r.inconclusive).toBeDefined();
  });

  it('still passes when a fetch of the media file was observed', () => {
    const ranged = netEvent(20, { method: 'GET', url: '/media/clip.mp4', status: 206, ok: true });
    const r = evalNet([API_CALL, ranged], {
      kind: PredicateKind.NET,
      urlContains: '/media/clip.mp4',
    });

    expect(r.pass).toBe(true);
  });

  it('still fails an ordinary API URL that never fired', () => {
    const r = evalNet([API_CALL, IMAGE_ENTRY], {
      kind: PredicateKind.NET,
      urlContains: '/api/save',
    });

    expect(r.pass).toBe(false);
    expect(r.inconclusive).toBeUndefined();
  });

  it('does not downgrade a filter that merely contains a media suffix mid-pattern', () => {
    const r = evalNet([API_CALL, IMAGE_ENTRY], {
      kind: PredicateKind.NET,
      urlContains: '/api/clip.mp4/list',
    });

    expect(r.inconclusive).toBeUndefined();
  });
});
