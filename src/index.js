const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const { execSync } = require('child_process');

// HTML Template Helpers
const styles = {
  card: `
    display: inline-block;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-left: 4px solid #6c757d;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 8px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #212529;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `,
  link: `
    color: #0969da;
    text-decoration: none;
    font-weight: 600;
    background: rgba(9, 105, 218, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  userLink: `
    color: #8250df;
    text-decoration: none;
    font-weight: 500;
    background: rgba(130, 80, 223, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  externalUserLink: `
    color: #57606a;
    text-decoration: none;
    font-weight: 500;
    background: rgba(87, 96, 106, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  badge: `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
  `,
  branchBadge: `
    background: #ddf4ff;
    color: #0969da;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
  `,
  commitBadge: `
    background: #fff8c5;
    color: #9a6700;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
  `,
  icon: `
    font-size: 16px;
    margin-right: 8px;
  `,
  timestamp: `
    color: #57606a;
    font-size: 12px;
    margin-top: 8px;
    display: block;
  `
};

const cardColors = {
  created: '#2da44e',
  merged: '#8250df',
  closed: '#cf222e',
  reopened: '#bf8700',
  review: '#0969da',
  approved: '#2da44e',
  changes: '#bf8700',
  comment: '#57606a',
  mention: '#8250df',
  info: '#6c757d'
};

const createCard = (color, icon, content) => `
<div style="${styles.card} border-left-color: ${color};">
  <span style="${styles.icon}">${icon}</span>
  ${content}
</div>
`.trim().replace(/\n\s+/g, ' ');

const createPRLink = (fullRepoName, pullNumber, repoName, reducedBaseBranchName) => `
<a href="https://github.com/${fullRepoName}/pull/${pullNumber}" 
   target="_blank" 
   style="${styles.link}"
   title="${fullRepoName}#${pullNumber}">
  ${repoName}#${pullNumber}
</a>
<span style="${styles.branchBadge}">${reducedBaseBranchName}</span>
`.trim().replace(/\n\s+/g, ' ');

const createUserLink = (serverUser, serverFullName, serverDefaultSitename) => `
<a href="/portal/${serverDefaultSitename}/profile/${serverUser}" 
   target="_self" 
   rel="noopener" 
   style="${styles.userLink}">
  ${serverFullName}
</a>
`.trim().replace(/\n\s+/g, ' ');

const createExternalUserLink = (githubUser) => `
<a href="https://github.com/${githubUser}" 
   target="_blank" 
   rel="noopener" 
   style="${styles.externalUserLink}">
  👾 ${githubUser}
</a>
`.trim().replace(/\n\s+/g, ' ');

const createCommitLink = (fullRepoName, sha, shortSha) => `
<a href="https://github.com/${fullRepoName}/commit/${sha}" 
   target="_blank" 
   style="${styles.commitBadge}">
  ${shortSha}
</a>
`.trim().replace(/\n\s+/g, ' ');

const createBranchLink = (fullRepoName, branchName) => `
<a href="https://github.com/${fullRepoName}/tree/${branchName}" 
   target="_blank" 
   style="${styles.branchBadge}">
  ${branchName}
</a>
`.trim().replace(/\n\s+/g, ' ');

const createEventLink = (url, text, color = '#0969da') => `
<a href="${url}" 
   target="_blank" 
   style="color: ${color}; text-decoration: none; font-weight: 600;">
  ${text}
</a>
`.trim().replace(/\n\s+/g, ' ');

const createMergeableBadge = () => `
<span style="${styles.badge} background: #d1f7c4; color: #1e7e34;">
  ✅ Ready to merge
</span>
`.trim().replace(/\n\s+/g, ' ');

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
    const prLink = createPRLink(fullRepoName, pullNumber, repoName, reducedBaseBranchName);

    if (eventName === 'pull_request') {
      const action = payload.action;
      
      if (action === 'review_requested') {
        const serverUser = await doGetAssociatedUsername(requestedReviewer);
        if (serverUser) {
          core.info(`👀 Review requested from ${serverUser}.`);
          msg = createCard(
            cardColors.review,
            '👀',
            `${prLink} is <strong>awaiting review</strong> from @${serverUser} `
          );
        } else {
          core.info('❌ Unable to retrieve Server user identifier! Aborting.');
          return;
        }
      } else if (payload.pull_request?.merged === true) {
        const shortCommitId = payload.pull_request.merge_commit_sha.substring(0, 7);
        const commitLink = createCommitLink(fullRepoName, payload.pull_request.merge_commit_sha, shortCommitId);
        const branchLink = createBranchLink(fullRepoName, baseBranchName);
        
        let mergeMethod = 'merged';
        if (payload.pull_request.auto_merge) {
          mergeMethod = `auto-${payload.pull_request.auto_merge.merge_method}`;
        }
        
        const mergerGithubUser = payload.pull_request.merged_by.login;
        const mergerServerUser = await doGetAssociatedUsername(mergerGithubUser);
        
        let mergerLink;
        if (!mergerServerUser) {
          core.info('❌ Unable to retrieve merger\'s server user identifier! Using Github username instead.');
          mergerLink = createExternalUserLink(mergerGithubUser);
        } else {
          const mergerServerProfile = await doGetUserProfile(mergerServerUser);
          const mergerServerFullName = mergerServerProfile?.fullname || mergerServerUser;
          mergerLink = createUserLink(mergerServerUser, mergerServerFullName, serverDefaultSitename);
        }
        
        msg = createCard(
          cardColors.merged,
          '🎉',
          `${prLink} was <strong>${mergeMethod}</strong> as ${commitLink} into ${branchLink} by ${mergerLink}`
        );
      } else if (action === 'closed') {
        msg = createCard(
          cardColors.closed,
          '🚫',
          `${prLink} has been <strong>closed</strong> without merging`
        );
      } else if (action === 'opened') {
        msg = createCard(
          cardColors.created,
          '🚀',
          `${prLink} has been <strong>created</strong> and is ready for review`
        );
      } else if (action === 'reopened') {
        msg = createCard(
          cardColors.reopened,
          '🔄',
          `${prLink} has been <strong>reopened</strong>`
        );
      } else {
        msg = createCard(
          cardColors.info,
          'ℹ️',
          `${prLink} has been updated <em>(${action})</em>`
        );
      }
    } else if (eventName === 'pull_request_review' && payload.action === 'submitted') {
      let mentionCreator = '';
      const commentMentionFilterRegex = /( |^)@[a-zA-Z0-9]+-?[a-zA-Z0-9]+( |$)/;
      
      const creatorResponse = await doGetAssociatedUsername(creator);
      if (creatorResponse) {
        mentionCreator = ` <em>cc @${creatorResponse} </em>`;
      }
      
      const reviewerGithubUser = payload.review.user.login;
      const reviewerServerUser = await doGetAssociatedUsername(reviewerGithubUser);
      
      let reviewerLink;
      if (!reviewerServerUser) {
        core.info('❌ Unable to retrieve reviewer\'s server user identifier! Using Github username instead.');
        reviewerLink = createExternalUserLink(reviewerGithubUser);
      } else {
        const reviewerServerProfile = await doGetUserProfile(reviewerServerUser);
        const reviewerServerFullName = reviewerServerProfile?.fullname || reviewerServerUser;
        reviewerLink = createUserLink(reviewerServerUser, reviewerServerFullName, serverDefaultSitename);
      }
      
      const reviewEventLink = payload.review.html_url;
      
      if (payload.review.state === 'changes_requested') {
        const changesLink = createEventLink(reviewEventLink, 'changes requested', cardColors.changes);
        msg = createCard(
          cardColors.changes,
          '🔧',
          `${prLink} has ${changesLink} by ${reviewerLink}${mentionCreator}`
        );
      } else if (payload.review.state === 'approved') {
        const approvedLink = createEventLink(reviewEventLink, 'approved', cardColors.approved);
        
        // Use gh CLI to check mergeable status
        let mergeableBadge = '';
        try {
          const mergeableStatus = execSync(`gh pr view ${pullNumber} --repo ${cloneUrl} --json mergeable -q .mergeable`, {
            env: { ...process.env, GH_TOKEN: ghToken }
          }).toString().trim();
          
          if (mergeableStatus === 'MERGEABLE') {
            mergeableBadge = createMergeableBadge();
          }
        } catch (error) {
          core.info(`Failed to check mergeable status: ${error.message}`);
        }
        
        msg = createCard(
          cardColors.approved,
          '✅',
          `${prLink} has been ${approvedLink} by ${reviewerLink}${mergeableBadge}${mentionCreator}`
        );
      } else if (payload.review.state === 'commented') {
        if (commentMentionFilterRegex.test(payload.review.body)) {
          const mentionLink = createEventLink(reviewEventLink, 'mentioned', cardColors.mention);
          const mentionedGithubUsers = payload.review.body.match(commentMentionFilterRegex)
            .map(m => m.trim().replace('@', ''));
          
          let mentionedServerUsers = [];
          for (const mentionedGithubUser of mentionedGithubUsers) {
            const response = await doGetAssociatedUsername(mentionedGithubUser);
            if (response) {
              mentionedServerUsers.push(`@${response} `);
            }
          }
          
          const mentionedUsersDisplay = mentionedServerUsers.length > 0 
            ? `<strong>${mentionedServerUsers.join('</strong> and <strong>')}</strong>`
            : `<em>${mentionedGithubUsers.length} user(s)</em>`;
          
          msg = createCard(
            cardColors.mention,
            '📣',
            `${prLink} ${mentionLink} ${mentionedUsersDisplay} in a comment by ${reviewerLink}`
          );
        } else {
          const commentLink = createEventLink(reviewEventLink, 'new comment', cardColors.comment);
          msg = createCard(
            cardColors.comment,
            '💬',
            `${prLink} has a ${commentLink} by ${reviewerLink}${mentionCreator}`
          );
        }
      } else {
        const stateLink = createEventLink(reviewEventLink, payload.review.state, cardColors.info);
        msg = createCard(
          cardColors.info,
          'ℹ️',
          `${prLink} review status: ${stateLink}`
        );
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