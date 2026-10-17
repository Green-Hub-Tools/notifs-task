import { jest } from '@jest/globals'
import { buildPullRequestMessage, buildReviewMessage } from './messages.js'

const makeCtx = ({ prInfo = {}, payload = {}, servers = {}, mergeable = false } = {}) => ({
  prInfo: {
    creator: 'alice',
    baseBranch: 'main',
    draft: false,
    merged: false,
    reviewUrl: 'https://github.com/o/r/pull/7#review',
    ...prInfo,
  },
  prLink: '<a href="https://github.com/o/r/pull/7">PR</a>',
  payload,
  repo: 'o/r',
  defaultSitename: 'dw',
  users: {
    username: jest.fn(async (login) => servers[login] ?? null),
    profile: jest.fn(async (name) => ({ fullname: `Full ${name}` })),
  },
  isMergeable: jest.fn(async () => mergeable),
  log: jest.fn(),
})

describe('buildPullRequestMessage', () => {
  it('announces opened PRs', async () => {
    const msg = await buildPullRequestMessage(makeCtx({ payload: { action: 'opened' } }))
    expect(msg).toContain('has been <strong>created</strong>')
  })

  it('skips opened draft PRs', async () => {
    const ctx = makeCtx({ payload: { action: 'opened' }, prInfo: { draft: true } })
    await expect(buildPullRequestMessage(ctx)).resolves.toBeNull()
    expect(ctx.log).toHaveBeenCalled()
  })

  it('announces ready_for_review, reopened and closed', async () => {
    expect(
      await buildPullRequestMessage(makeCtx({ payload: { action: 'ready_for_review' } })),
    ).toContain('ready for review')
    expect(await buildPullRequestMessage(makeCtx({ payload: { action: 'reopened' } }))).toContain(
      'reopened',
    )
    expect(await buildPullRequestMessage(makeCtx({ payload: { action: 'closed' } }))).toContain(
      'closed</strong> without merging',
    )
  })

  it('falls back to a generic card for other actions', async () => {
    const msg = await buildPullRequestMessage(makeCtx({ payload: { action: 'edited' } }))
    expect(msg).toContain('has been updated <em>(edited)</em>')
  })

  describe('review_requested', () => {
    it('mentions the requested reviewer', async () => {
      const ctx = makeCtx({
        payload: { action: 'review_requested' },
        prInfo: { requestedReviewer: 'bob' },
        servers: { bob: 'bob.s' },
      })
      expect(await buildPullRequestMessage(ctx)).toContain('awaiting review</strong> from @bob.s')
    })

    it('aborts when the reviewer is unknown on the server', async () => {
      const ctx = makeCtx({
        payload: { action: 'review_requested' },
        prInfo: { requestedReviewer: 'bob' },
      })
      await expect(buildPullRequestMessage(ctx)).resolves.toBeNull()
    })

    it('escapes a requested team name', async () => {
      const ctx = makeCtx({
        payload: { action: 'review_requested' },
        prInfo: { requestedTeam: '<b>core</b>' },
      })
      const msg = await buildPullRequestMessage(ctx)
      expect(msg).toContain('team <strong>&lt;b&gt;core&lt;/b&gt;</strong>')
      expect(msg).not.toContain('<b>core</b>')
    })

    it('aborts without reviewer or team', async () => {
      await expect(
        buildPullRequestMessage(makeCtx({ payload: { action: 'review_requested' } })),
      ).resolves.toBeNull()
    })
  })

  describe('merged', () => {
    const merged = {
      merged: true,
      mergeCommitSha: 'abcdef1234567',
      mergedBy: 'carol',
    }

    it('links the commit and the server user of the merger', async () => {
      const ctx = makeCtx({
        payload: { action: 'closed' },
        prInfo: merged,
        servers: { carol: 'carol.s' },
      })
      const msg = await buildPullRequestMessage(ctx)
      expect(msg).toContain('was <strong>merged</strong>')
      expect(msg).toContain('abcdef1')
      expect(msg).toContain('Full carol.s')
    })

    it('names the auto-merge method and falls back to the GitHub user', async () => {
      const ctx = makeCtx({
        payload: { action: 'closed' },
        prInfo: { ...merged, autoMerge: { merge_method: 'squash' } },
      })
      const msg = await buildPullRequestMessage(ctx)
      expect(msg).toContain('<strong>auto-squash</strong>')
      expect(msg).toContain('carol')
      expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining("merger's server user"))
    })
  })
})

describe('buildReviewMessage', () => {
  const review = (state, body = '') => ({
    prInfo: { reviewState: state, reviewBody: body },
    payload: { action: 'submitted', review: { user: { login: 'dave' } } },
    servers: { alice: 'alice.s', dave: 'dave.s' },
  })

  it('announces requested changes and cc the creator', async () => {
    const msg = await buildReviewMessage(makeCtx(review('changes_requested')))
    expect(msg).toContain('changes requested')
    expect(msg).toContain('cc @alice.s')
    expect(msg).toContain('Full dave.s')
  })

  it('announces dismissed reviews without cc', async () => {
    const msg = await buildReviewMessage(makeCtx(review('dismissed')))
    expect(msg).toContain('dismissed')
    expect(msg).not.toContain('cc @')
  })

  it('announces approvals and only adds the badge when mergeable', async () => {
    const plain = makeCtx(review('approved'))
    const badge = makeCtx({ ...review('approved'), mergeable: true })
    const withoutBadge = await buildReviewMessage(plain)
    const withBadge = await buildReviewMessage(badge)
    expect(withoutBadge).toContain('approved')
    expect(withBadge.length).toBeGreaterThan(withoutBadge.length)
    expect(badge.isMergeable).toHaveBeenCalled()
  })

  it('does not mention the creator on approval when auto-merge is on', async () => {
    const opts = review('approved')
    opts.prInfo.autoMerge = { merge_method: 'merge' }
    expect(await buildReviewMessage(makeCtx(opts))).not.toContain('cc @')
  })

  it('announces a plain comment', async () => {
    const msg = await buildReviewMessage(makeCtx(review('commented', 'looks fine')))
    expect(msg).toContain('new comment')
  })

  it('announces mentions with server users, or a count when unknown', async () => {
    const known = await buildReviewMessage(makeCtx(review('commented', 'ping @dave and @erin')))
    expect(known).toContain('@dave.s')
    const opts = review('commented', 'ping @zed')
    const unknown = await buildReviewMessage(makeCtx(opts))
    expect(unknown).toContain('1 user(s)')
  })

  it('falls back to a generic card for other states', async () => {
    const msg = await buildReviewMessage(makeCtx(review('pending')))
    expect(msg).toContain('review status')
  })

  it('uses the GitHub user when the reviewer has no server account', async () => {
    const opts = review('commented')
    opts.servers = { alice: 'alice.s' }
    const ctx = makeCtx(opts)
    await buildReviewMessage(ctx)
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining("reviewer's server user"))
  })

  it('quotes a short excerpt of a plain comment, escaped', async () => {
    const msg = await buildReviewMessage(
      makeCtx(review('commented', '<img src=x onerror=1> nice\n\nwork')),
    )
    expect(msg).toContain('“&lt;img src=x onerror=1&gt; nice work”')
    expect(msg).not.toContain('<img')
  })

  it('escapes server-provided user names', async () => {
    const opts = review('changes_requested')
    opts.servers = { alice: '<script>x</script>', dave: 'dave.s' }
    const msg = await buildReviewMessage(makeCtx(opts))
    expect(msg).toContain('cc @&lt;script&gt;x&lt;/script&gt;')
    expect(msg).not.toContain('<script>')
  })
})
