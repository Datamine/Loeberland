export function readChatPolicy(env: NodeJS.ProcessEnv = process.env) {
  function required(name: 'OAUTH_REQUIRED' | 'UPGRADE_REQUIRED_FOR_SERVER_CHAT') {
    const value = env[name]?.trim().toLowerCase();
    if (value === undefined || value === 'true') return true;
    if (value === 'false') return false;
    throw Error(name + ' must be True or False.');
  }
  return {
    oauthRequired: required('OAUTH_REQUIRED'),
    upgradeRequiredForServerChat: required('UPGRADE_REQUIRED_FOR_SERVER_CHAT'),
  };
}
