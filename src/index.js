import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'
import { execSync } from 'child_process'
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

async function getAssociatedUsername(api, githubUsername) {
  try {
    const response = await api.get(
      `/rest/private/gamification/connectors/username/github?connectorUserId=${githubUsername}`,
    )
    return response.data
  } catch (_error) {
    return null
  }
}

async function getUserProfile(api, serverUsername) {
  try {
    const response = await api.get(`/rest/private/v1/social/users/${serverUsername}`)
    return response.data
  } catch (_error) {
    return null
  }
}

function getPRInfo(payload) {
  const pr = payload.pull_request || payload.review?.pull_request
  if (!pr) return null

  return {
    title: pr.title,
    number: pr.number,
    creator: pr.user.login,
    baseBranch: pr.base.ref,
    cloneUrl: pr.head.repo.clone_url,
    merged: pr.merged,
    mergeCommitSha: pr.merge_commit_sha,
    autoMerge: pr.auto_merge,
    mergedBy: pr.merged_by?.login,
    reviewState: payload.review?.state,
    reviewUrl: payload.review?.html_url,
    reviewBody: payload.review?.body,
    reviewer: payload.review?.user?.login,
    requestedReviewer: payload.requested_reviewer?.login,
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
      cloneUrl,
      requestedReviewer,
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
    if (
      !baseBranch.match(
        /^(master|develop(-exo|-meed)?|feature\/[A-Za-z-]+[0-9]?|stable\/[0-9]+(\.[0-9]+)*\.x(-exo)?)$/i,
      )
    ) {
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

      if (action === 'review_requested') {
        const serverUser = await getAssociatedUsername(api, requestedReviewer)
        if (serverUser) {
          core.info(`👀 Review requested from ${serverUser}.`)
          msg = createCard(
            cardColors.review,
            '👀',
            `${prLink} is <strong>awaiting review</strong> from @${serverUser} `,
          )
        } else {
          core.info('❌ Unable to retrieve Server user identifier! Aborting.')
          return
        }
      } else if (merged === true) {
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
      } else if (action === 'closed') {
        msg = createCard(
          cardColors.closed,
          '🚫',
          `${prLink} has been <strong>closed</strong> without merging`,
        )
      } else if (action === 'opened') {
        msg = createCard(
          cardColors.created,
          '🚀',
          `${prLink} has been <strong>created</strong> and is ready for review`,
        )
      } else if (action === 'reopened') {
        msg = createCard(cardColors.reopened, '🔄', `${prLink} has been <strong>reopened</strong>`)
      } else {
        msg = createCard(cardColors.info, 'ℹ️', `${prLink} has been updated <em>(${action})</em>`)
      }
    } else if (eventName === 'pull_request_review' && payload.action === 'submitted') {
      let mentionCreator = ''
      const commentMentionFilterRegex = /( |^)@[a-zA-Z0-9]+-?[a-zA-Z0-9]+( |$)/

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
      } else if (reviewState === 'approved') {
        const approvedLink = createEventLink(reviewUrl, 'approved', cardColors.approved)

        // Use gh CLI to check mergeable status
        let mergeableBadge = ''
        try {
          const mergeableStatus = execSync(
            `gh pr view ${number} --repo ${cloneUrl} --json mergeable -q .mergeable`,
            {
              env: { ...process.env, GH_TOKEN: ghToken },
            },
          )
            .toString()
            .trim()

          if (mergeableStatus === 'MERGEABLE') {
            mergeableBadge = createMergeableBadge()
          }
        } catch (error) {
          core.info(`Failed to check mergeable status: ${error.message}`)
        }

        msg = createCard(
          cardColors.approved,
          '✅',
          `${prLink} has been ${approvedLink} by ${reviewerLink}${mergeableBadge}${mentionCreator}`,
        )
      } else if (reviewState === 'commented') {
        if (commentMentionFilterRegex.test(reviewBody)) {
          const mentionLink = createEventLink(reviewUrl, 'mentioned', cardColors.mention)
          const mentionedGithubUsers = reviewBody
            .match(commentMentionFilterRegex)
            .map((m) => m.trim().replace('@', ''))

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
    for (const taskId of tasksIds) {
      core.info(`Commenting to Task #${taskId}...`)
      try {
        const response = await api.post(`/rest/private/tasks/comments/${taskId}`, `<p>${msg}</p>`, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
        core.info(`Status code: ${response.status}`)
      } catch (error) {
        core.error(`Failed to post comment to task ${taskId}: ${error.message}`)
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
