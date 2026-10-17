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
  taskCommentsPath,
  excerpt,
  getPRInfo,
  alreadyPosted,
  extractTaskIds,
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

  describe('taskCommentsPath', () => {
    it('builds the comments path for a numeric id', () => {
      expect(taskCommentsPath('123')).toBe('/rest/private/tasks/comments/123')
    })

    it.each(['../admin', '1/../2', '12?x=1', '12 34', '', 'abc'])('rejects %j', (id) => {
      expect(() => taskCommentsPath(id)).toThrow('Invalid task id')
    })
  })

  describe('extractTaskIds', () => {
    const regex = '(?:TASK|task)-(\\d+)'

    it('returns one id per match', () => {
      expect(extractTaskIds('TASK-12: fix, task-34 too', regex)).toEqual(['12', '34'])
    })

    it('returns nothing when the title does not match', () => {
      expect(extractTaskIds('no id here', regex)).toEqual([])
    })

    it('ignores matches holding several numbers or no digits', () => {
      expect(extractTaskIds('TASK-1-2', 'TASK-\\d+-\\d+')).toEqual([])
      expect(extractTaskIds('TASK-x', 'TASK-x')).toEqual([])
    })
  })

  describe('getPRInfo', () => {
    const pull_request = {
      title: 'TASK-1 title',
      number: 7,
      user: { login: 'alice' },
      base: { ref: 'main' },
      draft: false,
      merged: true,
      merge_commit_sha: 'abc',
      auto_merge: null,
      merged_by: { login: 'bob' },
    }

    it('reads a pull_request payload', () => {
      expect(getPRInfo({ pull_request })).toMatchObject({
        title: 'TASK-1 title',
        number: 7,
        creator: 'alice',
        baseBranch: 'main',
        merged: true,
        mergeCommitSha: 'abc',
        mergedBy: 'bob',
        reviewState: undefined,
      })
    })

    it('reads a review payload', () => {
      const info = getPRInfo({
        review: {
          pull_request,
          state: 'approved',
          html_url: 'https://x/review',
          body: 'lgtm',
          user: { login: 'carol' },
        },
        requested_team: { name: 'core' },
      })
      expect(info).toMatchObject({
        reviewState: 'approved',
        reviewUrl: 'https://x/review',
        reviewBody: 'lgtm',
        reviewer: 'carol',
        requestedTeam: 'core',
      })
    })

    it('returns null without a pull request', () => {
      expect(getPRInfo({})).toBeNull()
    })
  })

  describe('alreadyPosted', () => {
    const msg =
      '<a href="https://github.com/o/r/pull/7">PR</a> by <a href="https://github.com/alice">alice</a>'
    const apiWith = (data) => ({ get: jest.fn().mockResolvedValue({ data }) })

    it('detects a comment holding all the links (array response)', async () => {
      const api = apiWith([
        { comment: '<p>https://github.com/o/r/pull/7 https://github.com/alice</p>' },
      ])
      await expect(alreadyPosted(api, '12', msg)).resolves.toBe(true)
      expect(api.get).toHaveBeenCalledWith('/rest/private/tasks/comments/12')
    })

    it('supports a { comments } response', async () => {
      const api = apiWith({
        comments: [{ comment: 'https://github.com/o/r/pull/7 https://github.com/alice' }],
      })
      await expect(alreadyPosted(api, '12', msg)).resolves.toBe(true)
    })

    it('is false when a link is missing or no comment matches', async () => {
      await expect(
        alreadyPosted(apiWith([{ comment: 'https://github.com/o/r/pull/7' }]), '12', msg),
      ).resolves.toBe(false)
      await expect(alreadyPosted(apiWith([]), '12', msg)).resolves.toBe(false)
    })

    it('is false when the message has no pull/commit link', async () => {
      const api = apiWith([{ comment: 'https://github.com/alice' }])
      await expect(
        alreadyPosted(api, '12', '<a href="https://github.com/alice">a</a>'),
      ).resolves.toBe(false)
    })

    it('is false on request errors and never requests an invalid id', async () => {
      const api = { get: jest.fn().mockRejectedValue(new Error('down')) }
      await expect(alreadyPosted(api, '12', msg)).resolves.toBe(false)
      const spy = { get: jest.fn() }
      await expect(alreadyPosted(spy, '../x', msg)).resolves.toBe(false)
      expect(spy.get).not.toHaveBeenCalled()
    })
  })

  describe('excerpt', () => {
    it('flattens whitespace, escapes and truncates', () => {
      expect(excerpt('a  b\n c')).toBe('a b c')
      expect(excerpt('<b>')).toBe('&lt;b&gt;')
      expect(excerpt('x'.repeat(200))).toHaveLength(140)
      expect(excerpt('x'.repeat(200)).endsWith('…')).toBe(true)
      expect(excerpt(undefined)).toBe('')
    })
  })
})
