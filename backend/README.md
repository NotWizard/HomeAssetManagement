# Backend (FastAPI)

## 启动

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir .
```

## 测试

```bash
source ../.venv/bin/activate
python -m pytest tests -q
```

## 关键模块

- `app/api/v1/` 路由层
- `app/services/` 业务服务
- `app/analytics/` 分析计算
- `app/jobs/` 定时任务
- `app/models/` 数据模型
