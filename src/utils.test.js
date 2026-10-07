import { jest } from '@jest/globals'
import {
  cardColors,
  createCard,
  createPRLink,
  createUserLink,
  createExternalUserLink,
  createCommitLink,
  createBranchLink,
  createEventLink,
  createMergeableBadge,
  createApprovalContent,
  escapeHtml,
  extractMentions,
  retry,
  getPullRequestEventKind,
} from './utils.js'

describe('utils', () => {
  test('createCard should return a formatted HTML string', () => {
    const card = createCard(cardColors.created, '🚀', 'Content')
    expect(card).toContain('border-left-color: #2da44e')
    expect(card).toContain('🚀')
    expect(card).toContain('Content')
  })

  test('createPRLink should return a formatted HTML string', () => {
    const link = createPRLink('owner/repo', 123, 'repo', 'main')
    expect(link).toContain('https://github.com/owner/repo/pull/123')
    expect(link).toContain('repo#123')
    expect(link).toContain('main')
  })

  test('createUserLink should return a formatted HTML string', () => {
    const link = createUserLink('user', 'Full Name', 'site')
    expect(link).toContain('/portal/site/profile/user')
    expect(link).toContain('Full Name')
  })

  test('createExternalUserLink should return a formatted HTML string', () => {
    const link = createExternalUserLink('githubUser')
    expect(link).toContain('https://github.com/githubUser')
    expect(link).toContain('👾 githubUser')
  })

  test('createCommitLink should return a formatted HTML string', () => {
    const link = createCommitLink('owner/repo', 'sha123', 'sha')
    expect(link).toContain('https://github.com/owner/repo/commit/sha123')
    expect(link).toContain('sha')
  })

  test('createBranchLink should return a formatted HTML string', () => {
    const link = createBranchLink('owner/repo', 'branch')
    expect(link).toContain('https://github.com/owner/repo/tree/branch')
    expect(link).toContain('branch')
  })

  test('createEventLink should return a formatted HTML string', () => {
    const link = createEventLink('url', 'text')
    expect(link).toContain('href="url"')
    expect(link).toContain('text')
  })

  test('createMergeableBadge should return a formatted HTML string', () => {
    const badge = createMergeableBadge()
    expect(badge).toContain('✅ Ready to merge')
  })

  describe('createApprovalContent', () => {
    const base = {
      prLink: 'PR',
      approvedLink: 'approved',
      reviewerLink: 'reviewer',
      mentionCreator: ' cc @owner',
    }

    test('mentions the PR owner when auto-merge is disabled', () => {
      expect(createApprovalContent({ ...base, autoMerge: null })).toBe(
        'PR has been approved by reviewer cc @owner',
      )
    })

    test('does not mention the PR owner when auto-merge is enabled', () => {
      const content = createApprovalContent({ ...base, autoMerge: { merge_method: 'squash' } })
      expect(content).toBe('PR has been approved by reviewer')
      expect(content).not.toContain('@owner')
    })

    test('keeps the mergeable badge when auto-merge is enabled', () => {
      const content = createApprovalContent({ ...base, mergeableBadge: '[ok]', autoMerge: {} })
      expect(content).toBe('PR has been approved by reviewer[ok]')
    })
  })

  describe('extractMentions', () => {
    test('finds every mention, with punctuation, newlines and hyphens', () => {
      const body = '@alice, please check\nwith @bob-smith and @c.\n(@d-e-f)'
      expect(extractMentions(body)).toEqual(['alice', 'bob-smith', 'c', 'd-e-f'])
    })

    test('ignores e-mails and handles nothing', () => {
      expect(extractMentions('write to me@example.com')).toEqual([])
      expect(extractMentions(null)).toEqual([])
    })

    test('deduplicates', () => {
      expect(extractMentions('@a @a @b')).toEqual(['a', 'b'])
    })
  })

  describe('escapeHtml', () => {
    test('escapes markup', () => {
      expect(escapeHtml('<img src=x onerror="a">&')).toBe(
        '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;',
      )
    })

    test('links escape user supplied values', () => {
      expect(createExternalUserLink('<b>x</b>')).not.toContain('<b>')
      expect(createBranchLink('o/r', 'a"b')).toContain('a&quot;b')
    })
  })

  describe('getPullRequestEventKind', () => {
    test.each([
      [{ action: 'closed', merged: true }, 'merged'],
      [{ action: 'closed', merged: false }, 'closed'],
      [{ action: 'labeled', merged: true }, 'updated'],
      [{ action: 'synchronize', merged: true }, 'updated'],
      [{ action: 'opened', draft: true }, 'skip'],
      [{ action: 'opened', draft: false }, 'opened'],
      [{ action: 'ready_for_review', draft: false }, 'ready_for_review'],
      [{ action: 'review_requested' }, 'review_requested'],
      [{ action: 'reopened' }, 'reopened'],
    ])('%j -> %s', (input, expected) => {
      expect(getPullRequestEventKind(input)).toBe(expected)
    })
  })

  describe('retry', () => {
    test('retries until success', async () => {
      const fn = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok')
      await expect(retry(fn, 3, 1)).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    test('throws the last error after all attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('boom'))
      await expect(retry(fn, 2, 1)).rejects.toThrow('boom')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
