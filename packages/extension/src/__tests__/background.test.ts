import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as any).chrome = {
    sidePanel: {
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: vi.fn() },
    },
    tabs: {
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      query: vi.fn(),
      get: vi.fn(),
    },
    cookies: {
      onChanged: { addListener: vi.fn() },
    },
    storage: {
      sync: {
        get: vi.fn().mockResolvedValue({ auth: { token: 'mock-jwt-token' } }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    notifications: {
      create: vi.fn(),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([{ result: 'Sarah Connor' }]),
    },
  };
});

import {
  isLinkedInProfileUrl,
  extractLinkedInUrlAndName,
  handleContextMenuAddProspect,
} from '../background';

describe('Background Service Worker & Context Menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    (globalThis as any).chrome = {
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
      contextMenus: {
        create: vi.fn(),
        onClicked: { addListener: vi.fn() },
      },
      tabs: {
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        query: vi.fn(),
        get: vi.fn(),
      },
      cookies: {
        onChanged: { addListener: vi.fn() },
      },
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ auth: { token: 'mock-jwt-token' } }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      notifications: {
        create: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: 'Sarah Connor' }]),
      },
    };
  });

  describe('isLinkedInProfileUrl', () => {
    it('returns true for valid LinkedIn profile URLs', () => {
      expect(isLinkedInProfileUrl('https://www.linkedin.com/in/jane-doe')).toBe(true);
      expect(isLinkedInProfileUrl('https://linkedin.com/in/jane-doe/')).toBe(true);
      expect(isLinkedInProfileUrl('https://www.linkedin.com/pub/some-user/1/2/3')).toBe(true);
    });

    it('returns false for non-profile URLs or invalid URLs', () => {
      expect(isLinkedInProfileUrl('https://www.linkedin.com/jobs/view/123')).toBe(false);
      expect(isLinkedInProfileUrl('https://www.linkedin.com/feed/')).toBe(false);
      expect(isLinkedInProfileUrl('https://google.com')).toBe(false);
      expect(isLinkedInProfileUrl('')).toBe(false);
      expect(isLinkedInProfileUrl(null)).toBe(false);
    });
  });

  describe('extractLinkedInUrlAndName', () => {
    it('extracts URL from linkUrl and name from selectionText', () => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        linkUrl: 'https://www.linkedin.com/in/alex-smith',
        selectionText: 'Alex Smith',
        pageUrl: 'https://news.ycombinator.com',
      } as any;

      const res = extractLinkedInUrlAndName(info);
      expect(res.url).toBe('https://www.linkedin.com/in/alex-smith');
      expect(res.name).toBe('Alex Smith');
    });

    it('falls back to pageUrl when right-clicking on a profile page without a link', () => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        pageUrl: 'https://www.linkedin.com/in/alex-smith',
        selectionText: 'Alex Smith',
      } as any;

      const res = extractLinkedInUrlAndName(info);
      expect(res.url).toBe('https://www.linkedin.com/in/alex-smith');
      expect(res.name).toBe('Alex Smith');
    });

    it('extracts embedded URL if user selected text containing a LinkedIn link', () => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        selectionText: 'Profile: https://www.linkedin.com/in/john-doe for more info',
      } as any;

      const res = extractLinkedInUrlAndName(info);
      expect(res.url).toBe('https://www.linkedin.com/in/john-doe');
    });
  });

  describe('handleContextMenuAddProspect', () => {
    it('notifies user if no LinkedIn URL can be detected', async () => {
      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        pageUrl: 'https://example.com',
      } as any;

      const res = await handleContextMenuAddProspect(info);
      expect(res.success).toBe(false);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('LinkedIn profile link'),
        })
      );
    });

    it('notifies user if not logged in (auth token missing)', async () => {
      (chrome.storage.sync.get as any).mockResolvedValueOnce({});

      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        linkUrl: 'https://www.linkedin.com/in/john-doe',
      } as any;

      const res = await handleContextMenuAddProspect(info);
      expect(res.success).toBe(false);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('log in to the Outreach CRM extension first'),
        })
      );
    });

    it('sends POST /api/prospects/from-linkedin and notifies on success', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          created: true,
          data: { first_name: 'John', last_name: 'Doe' },
        }),
      } as Response);

      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        linkUrl: 'https://www.linkedin.com/in/john-doe',
        selectionText: 'John Doe',
      } as any;

      const res = await handleContextMenuAddProspect(info);
      expect(res.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/prospects/from-linkedin'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-jwt-token',
          }),
          body: JSON.stringify({
            linkedin_url: 'https://www.linkedin.com/in/john-doe',
            name: 'John Doe',
          }),
        })
      );

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Added John Doe to CRM Prospects'),
        })
      );
    });

    it('handles manual entry required (pending prospect in Priority Center)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          created: true,
          manual_required: true,
          pendingProspect: { first_name: 'Alex', last_name: 'Smith' },
        }),
      } as Response);

      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        linkUrl: 'https://www.linkedin.com/in/alex-smith',
        selectionText: 'Alex Smith',
      } as any;

      const res = await handleContextMenuAddProspect(info);
      expect(res.success).toBe(true);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Priority Center'),
          message: expect.stringContaining('Added Alex Smith to Priority Action Center'),
        })
      );
    });

    it('handles server error responses gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid profile link' }),
      } as Response);

      const info: chrome.contextMenus.OnClickData = {
        menuItemId: 'add-linkedin-prospect',
        editable: false,
        linkUrl: 'https://www.linkedin.com/in/bad-profile',
      } as any;

      const res = await handleContextMenuAddProspect(info);
      expect(res.success).toBe(false);
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid profile link',
        })
      );
    });
  });
});
