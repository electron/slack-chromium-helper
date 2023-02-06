export const escapeSlackMessage = (text: string): string => {
  // Naively attempt to replace bold tags with Slack syntax
  text = text.replace(/<b>/g, '*').replace(/<\/b>/g, '*');
  // Some stack traces include "*.mm" which is a recognized domain in slack
  // but we don't want to linkify
  text = text.replace(/([a-z])\.mm([^a-z]|$)/g, '$1&period;mm$2');
  // Escape all magic Slack Characters
  text = text.replace(/\&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return text;
};
