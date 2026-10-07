import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'
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
  extractMentions,
  getPullRequestEventKind,
  escapeHtml,
  retry,
} from './utils.js'

// A run handles a single event, but the same people (creator, reviewer, merger) come up repeatedly
const usernameCache = new Map()
const profileCache = new Map()

const cached = (cache, key, load) => {
  if (!cache.has(key)) {
    cache.set(
      key,
      load().catch(() => null),
    )
  }
  return cache.get(key)
}

function getAssociatedUsername(api, githubUsername) {
  return cached(usernameCache, githubUsername, async () => {
    const response = await api.get(
      `/rest/private/gamification/connectors/username/github?connectorUserId=${encodeURIComponent(githubUsername)}`,
    )
    return response.data
  })
}

function getUserProfile(api, serverUsername) {
  return cached(profileCache, serverUsername, async () => {
    const response = await api.get(
      `/rest/private/v1/social/users/${encodeURIComponent(serverUsername)}`,
    )
    return response.data
  })
}

function getPRInfo(payload) {
  const pr = payload.pull_request || payload.review?.pull_request
  if (!pr) return null

  return {
    title: pr.title,
    number: pr.number,
    creator: pr.user.login,
    baseBranch: pr.base.ref,
    draft: pr.draft,
    merged: pr.merged,
    mergeCommitSha: pr.merge_commit_sha,
    autoMerge: pr.auto_merge,
    mergedBy: pr.merged_by?.login,
    reviewState: payload.review?.state,
    reviewUrl: payload.review?.html_url,
    reviewBody: payload.review?.body,
    reviewer: payload.review?.user?.login,
    requestedReviewer: payload.requested_reviewer?.login,
    requestedTeam: payload.requested_team?.name,
  }
}

// Best effort: the Tasks server may normalize the HTML, so match on the PR/event links only
async function alreadyPosted(api, taskId, msg) {
  try {
    const response = await api.get(`/rest/private/tasks/comments/${taskId}`)
    const comments = Array.isArray(response.data) ? response.data : response.data?.comments || []
    const urls = [...msg.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    const key = urls.filter((u) => /\/(pull|commit)\//.test(u)).join('|')
    return comments.some((c) => key && urls.every((u) => (c.comment || '').includes(u)))
  } catch (_error) {
    return false
  }
}

async function run() {
  try {
    // Get inputs
    const serverUrl = core.getInput('SERVER_URL')
    const serverUsername = core.getInput('SERVER_USERNAME')
    const serverPassword = core.getInput('SERVER_PASSWORD')
    const tasksRegexFilter = core.getInput('TASKS_REGEX_FILTER')
    const serverDefaultSitename = core.getInput('SERVER_DEFAULT_SITENAME')
    const branchRegexFilter = core.getInput('BRANCH_REGEX_FILTER')
    const deduplicate = core.getBooleanInput('DEDUPLICATE')
    const ghToken = core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN

    // Get context
    const context = github.context
    const eventName = context.eventName
    const payload = context.payload

    // Set up axios instance for API calls
    const api = axios.create({
      baseURL: serverUrl,
      auth: {
        username: serverUsername,
        password: serverPassword,
      },
      headers: {
        'User-Agent': 'PR Webhook Tasks/1.0',
      },
    })

    // Extract PR info
    const prInfo = getPRInfo(payload)
    if (!prInfo) {
      core.setFailed('No pull request information found')
      return
    }

    const {
      title,
      number,
      creator,
      baseBranch,
      requestedReviewer,
      requestedTeam,
      draft,
      merged,
      mergeCommitSha,
      autoMerge,
      mergedBy,
      reviewState,
      reviewUrl,
      reviewBody,
    } = prInfo

    const fullRepoName = context.repo.owner + '/' + context.repo.repo
    const repoName = context.repo.repo

    // Check if branch is supported
    if (!new RegExp(branchRegexFilter, 'i').test(baseBranch)) {
      core.info(`❌ Branch ${baseBranch} is not supported for Task notification. Aborting.`)
      return
    }

    // Check if creator is a bot
    if (creator.match(/^(dependabot\[bot\]|snyk-bot)$/i)) {
      core.info('🤖 PR created by a bot user is not supported for Task notification. Aborting.')
      return
    }

    // Check for tasks in PR title
    const taskRegex = new RegExp(tasksRegexFilter, 'i')
    if (!taskRegex.test(title)) {
      core.info('🚫 No relevant tasks found in the PR title. Aborting.')
      return
    }

    // Extract task IDs
    const taskMatches = title.match(new RegExp(tasksRegexFilter, 'gi')) || []
    const tasksIds = taskMatches.map((match) => match.match(/\d+/g).join(' ')).filter(Boolean)

    if (tasksIds.length === 0) {
      core.info('🚫 No task IDs found in the PR title. Aborting.')
      return
    }

    core.info(`OK Task(s) found! Starting notifications...`)

    const reducedBaseBranchName = baseBranch.replace(/feature\//gi, '').replace(/stable\//gi, '')

    let msg = ''
    const prLink = createPRLink(fullRepoName, number, repoName, reducedBaseBranchName)

    if (eventName === 'pull_request') {
      const action = payload.action
      const kind = getPullRequestEventKind({ action, merged, draft })

      if (kind === 'skip') {
        core.info('📝 Draft PR: notification will be sent when it is ready for review. Aborting.')
        return
      } else if (kind === 'review_requested') {
        if (requestedReviewer) {
          const serverUser = await getAssociatedUsername(api, requestedReviewer)
          if (!serverUser) {
            core.info('❌ Unable to retrieve Server user identifier! Aborting.')
            return
          }
          core.info(`👀 Review requested from ${serverUser}.`)
          msg = createCard(
            cardColors.review,
            '👀',
            `${prLink} is <strong>awaiting review</strong> from @${serverUser} `,
          )
        } else if (requestedTeam) {
          core.info(`👀 Review requested from team ${requestedTeam}.`)
          msg = createCard(
            cardColors.review,
            '👀',
            `${prLink} is <strong>awaiting review</strong> from team <strong>${escapeHtml(requestedTeam)}</strong>`,
          )
        } else {
          core.info('❌ No requested reviewer or team found! Aborting.')
          return
        }
      } else if (kind === 'merged') {
        const shortCommitId = mergeCommitSha.substring(0, 7)
        const commitLink = createCommitLink(fullRepoName, mergeCommitSha, shortCommitId)
        const branchLink = createBranchLink(fullRepoName, baseBranch)

        let mergeMethod = 'merged'
        if (autoMerge) {
          mergeMethod = `auto-${autoMerge.merge_method}`
        }

        const mergerServerUser = await getAssociatedUsername(api, mergedBy)

        let mergerLink
        if (!mergerServerUser) {
          core.info(
            "❌ Unable to retrieve merger's server user identifier! Using Github username instead.",
          )
          mergerLink = createExternalUserLink(mergedBy)
        } else {
          const mergerServerProfile = await getUserProfile(api, mergerServerUser)
          const mergerServerFullName = mergerServerProfile?.fullname || mergerServerUser
          mergerLink = createUserLink(mergerServerUser, mergerServerFullName, serverDefaultSitename)
        }

        msg = createCard(
          cardColors.merged,
          '🎉',
          `${prLink} was <strong>${mergeMethod}</strong> as ${commitLink} into ${branchLink} by ${mergerLink}`,
        )
      } else if (kind === 'closed') {
        msg = createCard(
          cardColors.closed,
          '🚫',
          `${prLink} has been <strong>closed</strong> without merging`,
        )
      } else if (kind === 'opened') {
        msg = createCard(
          cardColors.created,
          '🚀',
          `${prLink} has been <strong>created</strong> and is ready for review`,
        )
      } else if (kind === 'ready_for_review') {
        msg = createCard(cardColors.created, '🚀', `${prLink} is <strong>ready for review</strong>`)
      } else if (kind === 'reopened') {
        msg = createCard(cardColors.reopened, '🔄', `${prLink} has been <strong>reopened</strong>`)
      } else {
        msg = createCard(cardColors.info, 'ℹ️', `${prLink} has been updated <em>(${action})</em>`)
      }
    } else if (
      eventName === 'pull_request_review' &&
      ['submitted', 'dismissed'].includes(payload.action)
    ) {
      let mentionCreator = ''

      const creatorResponse = await getAssociatedUsername(api, creator)
      if (creatorResponse) {
        mentionCreator = ` <em>cc @${creatorResponse} </em>`
      }

      const reviewerGithubUser = payload.review.user.login
      const reviewerServerUser = await getAssociatedUsername(api, reviewerGithubUser)

      let reviewerLink
      if (!reviewerServerUser) {
        core.info(
          "❌ Unable to retrieve reviewer's server user identifier! Using Github username instead.",
        )
        reviewerLink = createExternalUserLink(reviewerGithubUser)
      } else {
        const reviewerServerProfile = await getUserProfile(api, reviewerServerUser)
        const reviewerServerFullName = reviewerServerProfile?.fullname || reviewerServerUser
        reviewerLink = createUserLink(
          reviewerServerUser,
          reviewerServerFullName,
          serverDefaultSitename,
        )
      }

      if (reviewState === 'changes_requested') {
        const changesLink = createEventLink(reviewUrl, 'changes requested', cardColors.changes)
        msg = createCard(
          cardColors.changes,
          '🔧',
          `${prLink} has ${changesLink} by ${reviewerLink}${mentionCreator}`,
        )
      } else if (reviewState === 'dismissed') {
        const dismissedLink = createEventLink(reviewUrl, 'dismissed', cardColors.info)
        msg = createCard(
          cardColors.info,
          '🚫',
          `A review on ${prLink} has been ${dismissedLink} (reviewer: ${reviewerLink})`,
        )
      } else if (reviewState === 'approved') {
        const approvedLink = createEventLink(reviewUrl, 'approved', cardColors.approved)

        let mergeableBadge = ''
        try {
          const { data } = await github
            .getOctokit(ghToken)
            .rest.pulls.get({ ...context.repo, pull_number: number })
          if (data.mergeable === true) {
            mergeableBadge = createMergeableBadge()
          }
        } catch (error) {
          core.info(`Failed to check mergeable status: ${error.message}`)
        }

        msg = createCard(
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
      } else if (reviewState === 'commented') {
        const mentionedGithubUsers = extractMentions(reviewBody)
        if (mentionedGithubUsers.length > 0) {
          const mentionLink = createEventLink(reviewUrl, 'mentioned', cardColors.mention)
          let mentionedServerUsers = []
          for (const mentionedGithubUser of mentionedGithubUsers) {
            const response = await getAssociatedUsername(api, mentionedGithubUser)
            if (response) {
              mentionedServerUsers.push(`@${response} `)
            }
          }

          const mentionedUsersDisplay =
            mentionedServerUsers.length > 0
              ? `<strong>${mentionedServerUsers.join('</strong> and <strong>')}</strong>`
              : `<em>${mentionedGithubUsers.length} user(s)</em>`

          msg = createCard(
            cardColors.mention,
            '📣',
            `${prLink} ${mentionLink} ${mentionedUsersDisplay} in a comment by ${reviewerLink}`,
          )
        } else {
          const commentLink = createEventLink(reviewUrl, 'new comment', cardColors.comment)
          msg = createCard(
            cardColors.comment,
            '💬',
            `${prLink} has a ${commentLink} by ${reviewerLink}${mentionCreator}`,
          )
        }
      } else {
        const stateLink = createEventLink(reviewUrl, reviewState, cardColors.info)
        msg = createCard(cardColors.info, 'ℹ️', `${prLink} review status: ${stateLink}`)
      }
    }

    core.info(`*** Message is:`)
    core.info(msg)
    core.info(`***`)

    // Post comments to tasks
    const failedTasks = []
    for (const taskId of tasksIds) {
      if (deduplicate && (await alreadyPosted(api, taskId, msg))) {
        core.info(`Task #${taskId} already has this notification. Skipping.`)
        continue
      }
      core.info(`Commenting to Task #${taskId}...`)
      try {
        const response = await retry(() =>
          api.post(`/rest/private/tasks/comments/${taskId}`, `<p>${msg}</p>`, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }),
        )
        core.info(`Status code: ${response.status}`)
      } catch (error) {
        failedTasks.push(taskId)
        core.error(`Failed to post comment to task ${taskId}: ${error.message}`)
      }
    }
    if (failedTasks.length > 0) {
      core.setFailed(`Failed to notify task(s): ${failedTasks.join(', ')}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
