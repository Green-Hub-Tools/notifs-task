const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const { execSync } = require('child_process');

async function run() {
  try {
    // Get inputs
    const serverUrl = core.getInput('SERVER_URL');
    const serverUsername = core.getInput('SERVER_USERNAME');
    const serverPassword = core.getInput('SERVER_PASSWORD');
    const tasksRegexFilter = core.getInput('TASKS_REGEX_FILTER');
    const serverDefaultSitename = core.getInput('SERVER_DEFAULT_SITENAME');
    const ghToken = core.getInput('GITHUB_TOKEN') || process.env.GITHUB_TOKEN;

    // Get context
    const context = github.context;
    const eventName = context.eventName;
    const payload = context.payload;

    // Set up axios instance for API calls
    const api = axios.create({
      baseURL: serverUrl,
      auth: {
        username: serverUsername,
        password: serverPassword
      },
      headers: {
        'User-Agent': 'PR Webhook Tasks/1.0'
      }
    });

    // Helper functions
    const doGetAssociatedUsername = async (githubUsername) => {
      try {
        const response = await api.get(`/rest/private/gamification/connectors/username/github?connectorUserId=${githubUsername}`);
        return response.data;
      } catch (error) {
        return null;
      }
    };

    const doGetUserProfile = async (serverUsername) => {
      try {
        const response = await api.get(`/rest/private/v1/social/users/${serverUsername}`);
        return response.data;
      } catch (error) {
        return null;
      }
    };

    // Extract PR info
    const pr = payload.pull_request || payload.review?.pull_request;
    if (!pr) {
      core.setFailed('No pull request information found');
      return;
    }

    const message = pr.title;
    const pullNumber = pr.number;
    const requestedReviewer = payload.requested_reviewer?.login;
    const creator = pr.user.login;
    const fullRepoName = context.repo.owner + '/' + context.repo.repo;
    const repoName = context.repo.repo;
    const baseBranchName = pr.base.ref;
    const cloneUrl = pr.head.repo.clone_url;

    // Check if branch is supported
    if (!baseBranchName.match(/^(master|develop(-exo|-meed)?|feature\/[A-Za-z-]+[0-9]?|stable\/[0-9]+(\.[0-9]+)*\.x(-exo)?)$/i)) {
      core.info(`❌ Branch ${baseBranchName} is not supported for Task notification. Aborting.`);
      return;
    }

    // Check if creator is a bot
    if (creator.match(/^(dependabot\[bot\]|snyk-bot)$/i)) {
      core.info('🤖 PR created by a bot user is not supported for Task notification. Aborting.');
      return;
    }

    // Check for tasks in PR title
    const taskRegex = new RegExp(tasksRegexFilter, 'i');
    if (!taskRegex.test(message)) {
      core.info('🚫 No relevant tasks found in the PR title. Aborting.');
      return;
    }

    // Extract task IDs
    const taskMatches = message.match(new RegExp(tasksRegexFilter, 'gi')) || [];
    const tasksIds = taskMatches.map(match => match.match(/\d+/g).join(' ')).filter(Boolean);
    
    if (tasksIds.length === 0) {
      core.info('🚫 No task IDs found in the PR title. Aborting.');
      return;
    }

    core.info(`OK Task(s) found! Starting notifications...`);
    
    const reducedBaseBranchName = baseBranchName
      .replace(/feature\//gi, '')
      .replace(/stable\//gi, '');
    
    let msg = '';
    const link = `PR <a href="https://github.com/${fullRepoName}/pull/${pullNumber}" title="${fullRepoName}#${pullNumber}:${baseBranchName}" target="_blank">${repoName}#${pullNumber}:${reducedBaseBranchName}</a>`;

    if (eventName === 'pull_request') {
      const action = payload.action;
      
      if (action === 'review_requested') {
        const serverUser = await doGetAssociatedUsername(requestedReviewer);
        if (serverUser) {
          core.info(`👀 Review requested from ${serverUser}.`);
          msg = `💭 ${link} is awaiting a review from @${serverUser} `;
        } else {
          core.info('❌ Unable to retrieve Server user identifier! Aborting.');
          return;
        }
      } else if (payload.pull_request?.merged === true) {
        const shortCommitId = payload.pull_request.merge_commit_sha.substring(0, 7);
        let mergeMethod = 'merged';
        
        if (payload.pull_request.auto_merge) {
          mergeMethod = `automatically ${payload.pull_request.auto_merge.merge_method}-merged`;
        }
        
        const mergedCommitLink = `<a href="https://github.com/${fullRepoName}/commit/${payload.pull_request.merge_commit_sha}" target="_blank">${shortCommitId}</a>`;
        const baseBranchLink = `<a href="https://github.com/${fullRepoName}/tree/${baseBranchName}" target="_blank">${baseBranchName}</a>`;
        const mergerGithubUser = payload.pull_request.merged_by.login;
        const mergerServerUser = await doGetAssociatedUsername(mergerGithubUser);
        
        let mergerServerLink;
        if (!mergerServerUser) {
          core.info('❌ Unable to retrieve merger\'s server user identifier! Using Github username instead.');
          const mergerServerFullName = mergerGithubUser;
          mergerServerLink = `👾 <a target="_self" rel="noopener" href="https://github.com/${mergerGithubUser}" class="user-suggester">${mergerServerFullName}</a>`;
          msg = `🌟 ${link} was ${mergeMethod} as ${mergedCommitLink} into ${baseBranchLink} by ${mergerServerLink}.`;
        } else {
          const mergerServerProfile = await doGetUserProfile(mergerServerUser);
          const mergerServerFullName = mergerServerProfile?.fullname || mergerServerUser;
          mergerServerLink = `<a target="_self" rel="noopener" href="/portal/${serverDefaultSitename}/profile/${mergerServerUser}" class="user-suggester">${mergerServerFullName}</a>`;
          msg = `🌟 ${link} was ${mergeMethod} as ${mergedCommitLink} into ${baseBranchLink} by ${mergerServerLink}.`;
        }
      } else if (action === 'closed') {
        msg = `🍂 ${link} has been ${action}.`;
      } else if (action === 'opened') {
        msg = `🌱 ${link} has been created.`;
      } else if (action === 'reopened') {
        msg = `🍃 ${link} has been reopened.`;
      } else {
        msg = `ℹ️ ${link} has been updated with action: ${action}.`;
      }
    } else if (eventName === 'pull_request_review' && payload.action === 'submitted') {
      let mentionCreator = '';
      const commentMentionFilterRegex = /( |^)@[a-zA-Z0-9]+-?[a-zA-Z0-9]+( |$)/;
      
      const creatorResponse = await doGetAssociatedUsername(creator);
      if (creatorResponse) {
        mentionCreator = ` FYI @${creatorResponse} `;
      }
      
      const reviewerGithubUser = payload.review.user.login;
      const reviewerServerUser = await doGetAssociatedUsername(reviewerGithubUser);
      
      let reviewerServerLink;
      if (!reviewerServerUser) {
        core.info('❌ Unable to retrieve reviewer\'s server user identifier! Using Github username instead.');
        const reviewerServerFullName = reviewerGithubUser;
        reviewerServerLink = `👾 <a target="_self" rel="noopener" href="https://github.com/${reviewerGithubUser}" class="user-suggester">${reviewerServerFullName}</a>`;
      } else {
        const reviewerServerProfile = await doGetUserProfile(reviewerServerUser);
        const reviewerServerFullName = reviewerServerProfile?.fullname || reviewerServerUser;
        reviewerServerLink = `<a target="_self" rel="noopener" href="/portal/${serverDefaultSitename}/profile/${reviewerServerUser}" class="user-suggester">${reviewerServerFullName}</a>`;
      }
      
      const reviewEventLink = payload.review.html_url;
      
      if (payload.review.state === 'changes_requested') {
        const requestChangesEventLink = `<a href="${reviewEventLink}">changes</a>`;
        msg = `🛠️ ${link} requires ${requestChangesEventLink} from ${reviewerServerLink}.${mentionCreator}`;
      } else if (payload.review.state === 'approved') {
        const approvedEventLink = `<a href="${reviewEventLink}">approved</a>`;
        
        // Use gh CLI to check mergeable status
        let mergeCheckMessage = '';
        try {
          const mergeableStatus = execSync(`gh pr view ${pullNumber} --repo ${cloneUrl} --json mergeable -q .mergeable`, {
            env: { ...process.env, GH_TOKEN: ghToken }
          }).toString().trim();
          
          if (mergeableStatus === 'MERGEABLE') {
            mergeCheckMessage = ' (✅ Cleared to merge)';
          } else if (mergeableStatus === 'UNKNOWN') {
            mergeCheckMessage = ' (❌ Merge conflicts detected)';
          }
        } catch (error) {
          core.info(`Failed to check mergeable status: ${error.message}`);
        }
        
        msg = `✅ ${link} has been ${approvedEventLink}${mergeCheckMessage} by ${reviewerServerLink}.${mentionCreator}`;
      } else if (payload.review.state === 'commented') {
        if (commentMentionFilterRegex.test(payload.review.body)) {
          const mentionEventLink = `<a href="${reviewEventLink}" target="_blank">mentioned</a>`;
          const mentionedGithubUsers = payload.review.body.match(commentMentionFilterRegex)
            .map(m => m.trim().replace('@', ''));
          
          let mentionedServerUsers = [];
          for (const mentionedGithubUser of mentionedGithubUsers) {
            const response = await doGetAssociatedUsername(mentionedGithubUser);
            if (response) {
              mentionedServerUsers.push(`@${response}`);
            }
          }
          
          const mentionedUsersDisplay = mentionedServerUsers.length > 0 
            ? mentionedServerUsers.join(' and ')
            : `${mentionedGithubUsers.length} user(s)`;
          
          msg = `🙋 ${link} has ${mentionEventLink} ${mentionedUsersDisplay} in a comment by ${reviewerServerLink}.`;
        } else {
          const commentEventLink = `<a href="${reviewEventLink}" target="_blank">commented</a>`;
          msg = `💬 ${link} has been ${commentEventLink} by ${reviewerServerLink}.${mentionCreator}`;
        }
      } else {
        const stateEventLink = `<a href="${reviewEventLink}">${payload.review.state}</a>`;
        msg = `ℹ️ ${link} has been ${stateEventLink}.`;
      }
    }

    core.info(`*** Message is:`);
    core.info(msg);
    core.info(`***`);

    // Post comments to tasks
    for (const taskId of tasksIds) {
      core.info(`Commenting to Task #${taskId}...`);
      try {
        const response = await api.post(`/rest/private/tasks/comments/${taskId}`, `<p>${msg}</p>`, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        core.info(`Status code: ${response.status}`);
      } catch (error) {
        core.error(`Failed to post comment to task ${taskId}: ${error.message}`);
      }
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();