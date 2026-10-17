import {
  cardColors,
  createCard,
  createUserLink,
  createExternalUserLink,
  createCommitLink,
  createBranchLink,
  createEventLink,
  createMergeableBadge,
  createApprovalContent,
  extractMentions,
  getPullRequestEventKind,
  escapeHtml,
} from './utils.js'

// Both builders return the card HTML, or null when nothing must be posted (the reason is logged).
// ctx: { prInfo, prLink, payload, repo, defaultSitename,
//        users: { username(githubLogin), profile(serverUsername) }, isMergeable(), log(message) }

const serverUserLink = async (ctx, githubUser, fallbackLog) => {
  const serverUser = await ctx.users.username(githubUser)
  if (!serverUser) {
    ctx.log(fallbackLog)
    return createExternalUserLink(githubUser)
  }
  const profile = await ctx.users.profile(serverUser)
  return createUserLink(serverUser, profile?.fullname || serverUser, ctx.defaultSitename)
}

async function buildPullRequestMessage(ctx) {
  const { prInfo, prLink, payload, repo, users, log } = ctx
  const { baseBranch, requestedReviewer, requestedTeam, draft, merged, mergeCommitSha, autoMerge } =
    prInfo
  const action = payload.action
  const kind = getPullRequestEventKind({ action, merged, draft })

  if (kind === 'skip') {
    log('📝 Draft PR: notification will be sent when it is ready for review. Aborting.')
    return null
  }
  if (kind === 'review_requested') {
    if (requestedReviewer) {
      const serverUser = await users.username(requestedReviewer)
      if (!serverUser) {
        log('❌ Unable to retrieve Server user identifier! Aborting.')
        return null
      }
      log(`👀 Review requested from ${serverUser}.`)
      return createCard(
        cardColors.review,
        '👀',
        `${prLink} is <strong>awaiting review</strong> from @${serverUser} `,
      )
    }
    if (requestedTeam) {
      log(`👀 Review requested from team ${requestedTeam}.`)
      return createCard(
        cardColors.review,
        '👀',
        `${prLink} is <strong>awaiting review</strong> from team <strong>${escapeHtml(requestedTeam)}</strong>`,
      )
    }
    log('❌ No requested reviewer or team found! Aborting.')
    return null
  }
  if (kind === 'merged') {
    const commitLink = createCommitLink(repo, mergeCommitSha, mergeCommitSha.substring(0, 7))
    const branchLink = createBranchLink(repo, baseBranch)
    const mergeMethod = autoMerge ? `auto-${autoMerge.merge_method}` : 'merged'
    const mergerLink = await serverUserLink(
      ctx,
      prInfo.mergedBy,
      "❌ Unable to retrieve merger's server user identifier! Using Github username instead.",
    )
    return createCard(
      cardColors.merged,
      '🎉',
      `${prLink} was <strong>${mergeMethod}</strong> as ${commitLink} into ${branchLink} by ${mergerLink}`,
    )
  }
  if (kind === 'closed') {
    return createCard(
      cardColors.closed,
      '🚫',
      `${prLink} has been <strong>closed</strong> without merging`,
    )
  }
  if (kind === 'opened') {
    return createCard(
      cardColors.created,
      '🚀',
      `${prLink} has been <strong>created</strong> and is ready for review`,
    )
  }
  if (kind === 'ready_for_review') {
    return createCard(cardColors.created, '🚀', `${prLink} is <strong>ready for review</strong>`)
  }
  if (kind === 'reopened') {
    return createCard(cardColors.reopened, '🔄', `${prLink} has been <strong>reopened</strong>`)
  }
  return createCard(cardColors.info, 'ℹ️', `${prLink} has been updated <em>(${action})</em>`)
}

async function buildReviewMessage(ctx) {
  const { prInfo, prLink, payload, users } = ctx
  const { creator, reviewState, reviewUrl, reviewBody, autoMerge } = prInfo

  const creatorServerUser = await users.username(creator)
  const mentionCreator = creatorServerUser ? ` <em>cc @${creatorServerUser} </em>` : ''

  const reviewerLink = await serverUserLink(
    ctx,
    payload.review.user.login,
    "❌ Unable to retrieve reviewer's server user identifier! Using Github username instead.",
  )

  if (reviewState === 'changes_requested') {
    const changesLink = createEventLink(reviewUrl, 'changes requested', cardColors.changes)
    return createCard(
      cardColors.changes,
      '🔧',
      `${prLink} has ${changesLink} by ${reviewerLink}${mentionCreator}`,
    )
  }
  if (reviewState === 'dismissed') {
    const dismissedLink = createEventLink(reviewUrl, 'dismissed', cardColors.info)
    return createCard(
      cardColors.info,
      '🚫',
      `A review on ${prLink} has been ${dismissedLink} (reviewer: ${reviewerLink})`,
    )
  }
  if (reviewState === 'approved') {
    const approvedLink = createEventLink(reviewUrl, 'approved', cardColors.approved)
    const mergeableBadge = (await ctx.isMergeable()) ? createMergeableBadge() : ''
    return createCard(
      cardColors.approved,
      '✅',
      createApprovalContent({
        prLink,
        approvedLink,
        reviewerLink,
        mergeableBadge,
        mentionCreator,
        autoMerge,
      }),
    )
  }
  if (reviewState === 'commented') {
    const mentionedGithubUsers = extractMentions(reviewBody)
    if (mentionedGithubUsers.length === 0) {
      const commentLink = createEventLink(reviewUrl, 'new comment', cardColors.comment)
      return createCard(
        cardColors.comment,
        '💬',
        `${prLink} has a ${commentLink} by ${reviewerLink}${mentionCreator}`,
      )
    }
    const mentionLink = createEventLink(reviewUrl, 'mentioned', cardColors.mention)
    const mentionedServerUsers = []
    for (const mentionedGithubUser of mentionedGithubUsers) {
      const serverUser = await users.username(mentionedGithubUser)
      if (serverUser) mentionedServerUsers.push(`@${serverUser} `)
    }
    const mentionedUsersDisplay =
      mentionedServerUsers.length > 0
        ? `<strong>${mentionedServerUsers.join('</strong> and <strong>')}</strong>`
        : `<em>${mentionedGithubUsers.length} user(s)</em>`
    return createCard(
      cardColors.mention,
      '📣',
      `${prLink} ${mentionLink} ${mentionedUsersDisplay} in a comment by ${reviewerLink}`,
    )
  }
  const stateLink = createEventLink(reviewUrl, reviewState, cardColors.info)
  return createCard(cardColors.info, 'ℹ️', `${prLink} review status: ${stateLink}`)
}

export { buildPullRequestMessage, buildReviewMessage }
