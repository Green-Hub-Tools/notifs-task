import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'
import {
  createPRLink,
  taskCommentsPath,
  getPRInfo,
  alreadyPosted,
  extractTaskIds,
  retry,
} from './utils.js'
import { buildPullRequestMessage, buildReviewMessage } from './messages.js'

// A run handles a single event, but the same people (creator, reviewer, merger) come up repeatedly
const usernameCache = new Map()
const profileCache = new Map()

const cached = (cache, key, load) => {
  if (!cache.has(key)) {
    cache.set(
      key,
      retry(load, 2, 300).catch(() => null),
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

    const { title, number, creator, baseBranch } = prInfo

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
    const tasksIds = extractTaskIds(title, tasksRegexFilter)

    if (tasksIds.length === 0) {
      core.info('🚫 No task IDs found in the PR title. Aborting.')
      return
    }

    core.info(`OK Task(s) found! Starting notifications...`)

    const reducedBaseBranchName = baseBranch.replace(/feature\//gi, '').replace(/stable\//gi, '')

    const prLink = createPRLink(fullRepoName, number, repoName, reducedBaseBranchName)
    const messageContext = {
      prInfo,
      prLink,
      payload,
      repo: fullRepoName,
      defaultSitename: serverDefaultSitename,
      users: {
        username: (githubUser) => getAssociatedUsername(api, githubUser),
        profile: (serverUser) => getUserProfile(api, serverUser),
      },
      isMergeable: async () => {
        try {
          const { data } = await github
            .getOctokit(ghToken)
            .rest.pulls.get({ ...context.repo, pull_number: number })
          return data.mergeable === true
        } catch (error) {
          core.info(`Failed to check mergeable status: ${error.message}`)
          return false
        }
      },
      log: (message) => core.info(message),
    }

    let msg = null
    if (eventName === 'pull_request') {
      msg = await buildPullRequestMessage(messageContext)
    } else if (
      eventName === 'pull_request_review' &&
      ['submitted', 'dismissed'].includes(payload.action)
    ) {
      msg = await buildReviewMessage(messageContext)
    }
    if (!msg) {
      core.info('No notification to send for this event. Aborting.')
      return
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
          api.post(taskCommentsPath(taskId), `<p>${msg}</p>`, {
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
