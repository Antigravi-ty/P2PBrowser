# CI Workflow Updates

由于当前 GitHub App 密钥未配置 `workflows: write` 权限，直接推送至 `.github/workflows/` 会被 GitHub API 拒绝。因此我们将优化后的 workflow 文件存放在本目录中。

## 文件说明
- `windows-build.yml`: 集成 `sccache` 编译器级别缓存、防历史产物污染、支持跨分支内容寻址复用、并自动在 GitHub Step Summary 输出缓存命中率（百分比/命中条目数）统计的完整配置。

## 应用方式
您可以直接在 GitHub Web 界面或使用拥有工作流修改权限的账户将 `workflow-updates/windows-build.yml` 复制/覆盖至 `.github/workflows/windows-build.yml`。
