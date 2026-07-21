import shutil
from pathlib import Path

base = Path('C:/Users/koech/Documents/New OpenCode Project/trendy-frontend')

# The root admin.html is what Vercel serves at /admin (per vercel.json rewrite)
# admin/index.html has the new features, root admin.html might not
admin_index = base / 'admin' / 'index.html'
root_admin = base / 'admin.html'
public_admin = base / 'public' / 'admin.html'

# Check which files have the features
def check(path):
    if not path.exists():
        return 'FILE NOT FOUND'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    return f'productOriginalPrice={"YES" if "productOriginalPrice" in c else "NO"} productLimitedAvailable={"YES" if "productLimitedAvailable" in c else "NO"} size={path.stat().st_size}'

results = []
results.append(f'admin/index.html: {check(admin_index)}')
results.append(f'admin.html (root): {check(root_admin)}')
results.append(f'public/admin.html: {check(public_admin)}')

# Copy admin/index.html to root admin.html and public/admin.html
if admin_index.exists():
    shutil.copy2(admin_index, root_admin)
    shutil.copy2(admin_index, public_admin)
    results.append('COPIED admin/index.html -> admin.html (root) and public/admin.html')

results.append(f'After copy:')
results.append(f'admin.html (root): {check(root_admin)}')
results.append(f'public/admin.html: {check(public_admin)}')

with open('C:/Users/koech/Documents/New OpenCode Project/deploy_log.txt', 'w') as f:
    f.write('\n'.join(results))
