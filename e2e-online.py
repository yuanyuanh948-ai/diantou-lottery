# -*- coding: utf-8 -*-
# 线上验收脚本：抽奖/防重/后台/核销/CSV 全流程（跑完自动清理测试记录）
import urllib.request, urllib.error, json, os, getpass

BASE = 'https://dtgift.hyyuan.me'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
# 后台密码不写死在代码里：优先读环境变量 ADMIN_PASSWORD，没有则运行时手动输入
PW = os.environ.get('ADMIN_PASSWORD') or getpass.getpass('后台密码: ')

def req(path, method='GET', data=None, headers=None):
    hh = {'User-Agent': UA}
    if headers:
        hh.update(headers)
    r = urllib.request.Request(BASE + path, method=method, data=data, headers=hh)
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

ok = []
def check(name, cond, detail=''):
    ok.append(cond)
    print(('PASS' if cond else 'FAIL'), name, detail)

s, h, b = req('/api/health')
check('health', s == 200, b.decode()[:60])

s, h, b = req('/')
html = b.decode('utf-8', 'ignore')
check('student page', s == 200 and '开箱抽奖' in html, str(len(b)) + 'B')

s, h, b = req('/logo.png')
check('logo.png', s == 200 and len(b) > 5000, str(len(b)) + 'B')

s, h, b = req('/api/config')
cfg = json.loads(b)
nopct = 'pct' not in b.decode()
check('config', s == 200 and len(cfg.get('prizes', [])) == 4 and nopct,
      str([p['level'] for p in cfg.get('prizes', [])]))

body = json.dumps({'nickname': 'ceshi', 'phone': '13800001111'}).encode()
s, h, b = req('/api/draw', 'POST', body, {'content-type': 'application/json'})
r1 = json.loads(b)
code1 = (r1.get('result') or {}).get('code', '')
check('first draw', s == 200 and r1.get('already') is False and len(code1) >= 8,
      'code=' + code1 + ' prize=' + str((r1.get('result') or {}).get('level')))

s, h, b = req('/api/draw', 'POST', body, {'content-type': 'application/json'})
r2 = json.loads(b)
check('phone dedupe', s == 200 and r2.get('already') is True and (r2.get('result') or {}).get('code') == code1)

body_x = json.dumps({'nickname': 'other', 'phone': '13800001111'}).encode()
s, h, b = req('/api/draw', 'POST', body_x, {'content-type': 'application/json'})
r3 = json.loads(b)
check('nickname change no redraw', s == 200 and r3.get('already') is True and (r3.get('result') or {}).get('code') == code1)

body_bad = json.dumps({'nickname': 'x', 'phone': '12345'}).encode()
s, h, b = req('/api/draw', 'POST', body_bad, {'content-type': 'application/json'})
check('bad phone 400', s == 400)

s, h, b = req('/api/admin/login', 'POST', json.dumps({'password': PW}).encode(),
              {'content-type': 'application/json'})
cookie = next((v for k, v in h.items() if k.lower() == 'set-cookie'), '').split(';')[0]
check('admin login', s == 200 and cookie.startswith('dt_admin='))

s, h, b = req('/api/admin/data', 'GET', None, {'cookie': 'dt_admin=forged'})
check('forged cookie 401', s == 401)

s, h, b = req('/api/admin/data', 'GET', None, {'cookie': cookie})
d = json.loads(b)
rows = d.get('rows', [])
check('admin data', s == 200 and d.get('stats', {}).get('total') == 1 and len(rows) == 1)
tid = rows[0]['id'] if rows else None

if tid:
    s, h, b = req('/api/admin/redeem', 'POST', json.dumps({'code': code1, 'redeemed': True}).encode(),
                  {'cookie': cookie, 'content-type': 'application/json'})
    check('redeem', s == 200)
    s, h, b = req('/api/admin/redeem', 'POST', json.dumps({'code': code1, 'redeemed': False}).encode(),
                  {'cookie': cookie, 'content-type': 'application/json'})
    check('un-redeem', s == 200)

s, h, b = req('/api/admin/export.csv', 'GET', None, {'cookie': cookie})
csv_text = b.decode('utf-8-sig', 'ignore')
check('csv', s == 200 and 'ceshi' in csv_text and '13800001111' in csv_text, str(len(b)) + 'B')

s, h, b = req('/admin/')
check('admin page', s == 200)

if tid:
    s, h, b = req('/api/admin/delete', 'POST', json.dumps({'id': tid}).encode(),
                  {'cookie': cookie, 'content-type': 'application/json'})
    check('delete test row', s == 200)
    s, h, b = req('/api/admin/data', 'GET', None, {'cookie': cookie})
    check('db clean', json.loads(b).get('stats', {}).get('total') == 0)

print('====', ('ALL ' + str(len(ok)) + ' PASS') if all(ok) else 'SOME FAILED', '====')
