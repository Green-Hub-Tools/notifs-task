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
})
