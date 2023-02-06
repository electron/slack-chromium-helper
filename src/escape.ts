export const escapeSlackMessage = (text: string): string => {
  // Naively attempt to replace bold tags with Slack syntax
  text = text.replace(/<b>/g, '**').replace(/<\/b>/g, '**');
  // Escape all magic Slack Characters
  return text.replace(/\&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};
