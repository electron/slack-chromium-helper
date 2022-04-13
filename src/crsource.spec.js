import { parseChromiumSourceURL } from './crsource';

describe('parseChromiumSourceURL', () => {
  it('should handle direct file URLs', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/exported/web_label_element.cc',
      ),
    ).toHaveProperty('fileName', 'third_party/blink/renderer/core/exported/web_label_element.cc');
  });

  it('should handle specific commit hashes', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/exported/web_label_element.cc;drc=cd03a7bbb6e1d892ba631d5229a98022fc4cf125',
      ),
    ).toHaveProperty('hash', 'cd03a7bbb6e1d892ba631d5229a98022fc4cf125');
  });

  it('should handle line ranges', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/exported/web_label_element.cc;l=33-35',
      ),
    ).toHaveProperty('lineRange', '33-35');
  });

  it('should handle non-main branches', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/src/+/lkgr:third_party/blink/renderer/core/exported/web_label_element.cc',
      ),
    ).toHaveProperty('branch', 'lkgr');
  });

  it('should handle non-src paths', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/tools/depot_tools/+/main:gclient.py;l=677-686?q=gclient.py&ss=chromium',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "branch": "main",
        "fileName": "gclient.py",
        "hash": undefined,
        "lineRange": "677-686",
        "parent": "chromium",
        "project": "chromium",
        "projectKey": "tools/depot_tools",
      }
    `);
  });

  it('should handle complex URLs', () => {
    expect(
      parseChromiumSourceURL(
        'https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/exported/web_view_impl.cc;l=241-245;drc=8d990c92df3d03ff3d313428f25dd11b7e509bcf?q=SetUseExternalPopupMenus&ss=chromium',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "branch": "main",
        "fileName": "third_party/blink/renderer/core/exported/web_view_impl.cc",
        "hash": "8d990c92df3d03ff3d313428f25dd11b7e509bcf",
        "lineRange": "241-245",
        "parent": "chromium",
        "project": "chromium",
        "projectKey": "src",
      }
    `);
  });
});
