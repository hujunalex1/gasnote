#!/usr/bin/env python3
"""
加油记账 UI 核心链路冒烟测试（Playwright）。

用法：
  1. npm run build
  2. npx vite preview --port 4173
  3. python3 scripts/smoke-e2e.py http://localhost:4173
"""

import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # 1. 打开页面（干净 localStorage）
        page.goto(BASE_URL, wait_until="networkidle")
        assert page.locator("h1", has_text="加油记账").is_visible()

        # 2. 记第一笔（带里程和升数）
        page.fill("#entry-amount", "320")
        page.fill("#entry-note", "中石化")
        page.fill("#entry-odometer", "12000")
        page.fill("#entry-liters", "40")
        page.get_by_role("button", name="记下").click()

        # 校验明细展示金额、单价（8.00 元/L）以及里程输入框出现「上次 12,000」提示
        assert page.get_by_text("¥320.00").first.is_visible()
        assert page.get_by_text("8.00 元/L").is_visible()
        assert page.locator("#entry-odometer").get_attribute("placeholder") == "上次 12,000"

        # 3. 记第二笔满油，校验油耗算出
        page.fill("#entry-amount", "350")
        page.fill("#entry-odometer", "12500")
        page.fill("#entry-liters", "40")
        page.get_by_role("button", name="记下").click()
        assert page.get_by_text("8.0 L/100km").first.is_visible()

        # 4. 编辑最新一条记录（应用内 EditRecordDialog）
        page.get_by_role("button", name="编辑").first.click()
        assert page.get_by_role("heading", name="编辑记录").is_visible()
        page.fill("#edit-amount", "360")
        page.fill("#edit-note", "已修改备注")
        page.get_by_role("button", name="保存").click()
        assert page.get_by_text("¥360.00").first.is_visible()
        assert page.get_by_text("已修改备注").is_visible()
        assert page.get_by_text("已更新记录。").is_visible()

        # 5. 点开懒加载日历并关闭
        page.locator("#entry-date").click()
        page.get_by_role("button", name="今天").wait_for(state="visible", timeout=5000)
        page.get_by_role("button", name="今天").click()

        # 6. 备份面板导出 CSV，校验文件名和内容
        page.get_by_role("button", name="云端同步与导入导出").click()
        with page.expect_download() as dl_info:
            page.get_by_role("button", name="导出 CSV").click()
        csv_path = dl_info.value.path()
        csv_text = Path(csv_path).read_text(encoding="utf-8-sig")
        assert "日期,金额(元),升数(L),单价(元/L)" in csv_text
        assert "360.00" in csv_text

        # 7. 导入损坏的 JSON 文件：应提示 Toast 错误且原记录不受影响
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as bad:
            bad.write("{not valid json")
            bad_path = bad.name
        page.locator('input[type="file"]').set_input_files(bad_path)
        assert page.get_by_text("导入失败").is_visible()
        assert page.get_by_text("¥360.00").first.is_visible()

        # 8. 导入合法 JSON 文件：弹出应用内 ConfirmDialog 并确认替换
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as good:
            json.dump(
                {
                    "version": 1,
                    "records": [
                        {"id": "imp-1", "date": "2026-11-01", "amount": 288.5, "note": "导入测试"}
                    ],
                },
                good,
            )
            good_path = good.name
        page.locator('input[type="file"]').set_input_files(good_path)
        assert page.get_by_role("heading", name="确认导入并替换当前记录？").is_visible()
        page.get_by_role("button", name="确认导入").click()
        assert page.get_by_text("已导入 1 条记录。").is_visible()

        # 9. 就地确认删除
        page.get_by_role("button", name="删除").first.click()
        page.get_by_role("button", name="是").click()
        assert page.get_by_text("还没有记录").is_visible()

        # 10. 手机视口（390×844）布局与边缘防溢校验
        mobile = browser.new_context(viewport={"width": 390, "height": 844})
        mp = mobile.new_page()
        mp.goto(BASE_URL, wait_until="networkidle")
        mp.fill("#entry-amount", "320")
        mp.fill("#entry-odometer", "10000")
        mp.fill("#entry-liters", "40")
        mp.get_by_role("button", name="记下").click()
        mp.fill("#entry-amount", "350")
        mp.fill("#entry-odometer", "10500")
        mp.fill("#entry-liters", "40")
        mp.get_by_role("button", name="记下").click()

        # 无横向溢出
        overflow = mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        assert overflow <= 0, f"手机端出现横向溢出: {overflow}px"

        # 首屏（844px 内）即可看到「本月」概览卡
        summary_box = mp.locator("h2", has_text="本月").bounding_box()
        assert summary_box is not None and summary_box["y"] < 600, f"首屏未见本月统计: {summary_box}"

        # 明细里的油耗完整可见，未超出视口
        econ_box = mp.locator("li").first.get_by_text("8.0 L/100km").bounding_box()
        assert econ_box is not None and econ_box["x"] + econ_box["width"] <= 390

        # 1 月与 12 月选中金额标签不越出卡片左右边界
        chart_card = mp.locator("section").filter(has=mp.locator("h2", has_text="每月金额"))
        chart_box = chart_card.bounding_box()
        assert chart_box is not None
        for m in (1, 12):
            chart_card.locator("button").nth(m - 1).click()
            label_box = chart_card.locator("button").nth(m - 1).locator("span").first.bounding_box()
            assert label_box is not None
            assert label_box["x"] >= chart_box["x"], f"{m}月标签左侧溢出: {label_box} vs {chart_box}"
            assert (
                label_box["x"] + label_box["width"] <= chart_box["x"] + chart_box["width"]
            ), f"{m}月标签右侧溢出: {label_box} vs {chart_box}"

        mobile.close()
        browser.close()
        print("SMOKE_E2E_PASSED")


if __name__ == "__main__":
    main()
