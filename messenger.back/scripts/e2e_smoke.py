"""Smoke E2E против локального IAM (:8001) + Messenger (:8000).

Запуск: ``python scripts/e2e_smoke.py`` из ``messenger.back``.
"""

from __future__ import annotations

from typing import Any

import asyncio
import json
import sys
import uuid
from http import HTTPStatus

import aiohttp

IAM_URL = "http://localhost:8001"
API_URL = "http://127.0.0.1:8000"
ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "admin"


class SmokeTestError(Exception):
    pass


def _ok(name: str) -> None:
    print(f"OK  {name}")


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise SmokeTestError(msg)


async def login(session: aiohttp.ClientSession) -> str:
    data = aiohttp.FormData()
    data.add_field("username", ADMIN_EMAIL)
    data.add_field("password", ADMIN_PASSWORD)
    async with session.post(f"{IAM_URL}/api/v1/auth/login", data=data) as resp:
        body = await resp.json()
        _require(resp.status == HTTPStatus.OK, f"login status={resp.status} body={body}")
        token = body["access_token"]
        _ok("IAM login")
        return token


async def api(
    session: aiohttp.ClientSession,
    method: str,
    path: str,
    *,
    token: str,
    json_body: dict[str, Any] | None = None,
    expected: int = 200,
) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    async with session.request(
        method,
        f"{API_URL}{path}",
        headers=headers,
        json=json_body,
    ) as resp:
        text = await resp.text()
        try:
            payload = json.loads(text) if text else None
        except json.JSONDecodeError:
            payload = text
        _require(
            resp.status == expected,
            f"{method} {path} status={resp.status} expected={expected} body={payload}",
        )
        return payload


# Keep the ordered end-to-end scenario together so each step can use the previous response.
async def run() -> None:  # noqa: C901, PLR0915
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        # health
        async with session.get(f"{API_URL}/health/live") as resp:
            _require(resp.status == HTTPStatus.OK, "health/live failed")
            _ok("messenger health")

        token = await login(session)

        # auth via messenger
        manifest = await api(session, "GET", "/v1/sync/manifest", token=token)
        _require("conversations" in manifest, "manifest shape")
        _ok("GET /v1/sync/manifest")

        # conversation
        title = f"E2E {uuid.uuid4().hex[:8]}"
        conv = await api(
            session,
            "POST",
            "/v1/conversations",
            token=token,
            json_body={"title": title, "memberIds": []},
            expected=201,
        )
        conversation_id = conv["id"]
        _ok(f"POST /v1/conversations ({conversation_id})")

        # send
        client_message_id = str(uuid.uuid4())
        msg = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/messages",
            token=token,
            json_body={
                "clientMessageId": client_message_id,
                "blocks": [{"type": "text", "text": "hello e2e"}],
            },
            expected=201,
        )
        message_id = msg["id"]
        created_seq = msg["createdSeq"]
        _require(created_seq >= 1, "createdSeq")
        _ok(f"POST message seq={created_seq}")

        # idempotent replay
        msg2 = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/messages",
            token=token,
            json_body={
                "clientMessageId": client_message_id,
                "blocks": [{"type": "text", "text": "hello e2e"}],
            },
            expected=201,
        )
        _require(msg2["id"] == message_id, "idempotent id mismatch")
        _ok("idempotent send")

        # history / events
        history = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/messages?limit=10",
            token=token,
        )
        _require(any(item["id"] == message_id for item in history), "history missing message")
        _ok("GET history")

        events = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/events?afterSeq=0",
            token=token,
        )
        _require(any(ev["seq"] == created_seq for ev in events), "events missing created")
        _ok("GET events delta")

        # edit
        edited = await api(
            session,
            "PATCH",
            f"/v1/conversations/{conversation_id}/messages/{message_id}",
            token=token,
            json_body={"blocks": [{"type": "text", "text": "hello edited"}]},
        )
        expected_revision = 2
        _require(edited["revision"] == expected_revision, f"revision={edited['revision']}")
        _ok("PATCH edit")

        # read cursor
        cursor = await api(
            session,
            "PUT",
            f"/v1/conversations/{conversation_id}/read-cursor",
            token=token,
            json_body={"lastReadMessageSeq": edited["eventSeq"]},
        )
        _require(cursor["lastReadMessageSeq"] >= created_seq, "cursor not advanced")
        _ok("PUT read-cursor")

        # ws ticket
        ticket = await api(session, "POST", "/v1/ws/tickets", token=token, expected=201)
        _require(ticket.get("ticket"), "ticket missing")
        _require(ticket["expiresIn"] > 0, "expiresIn")
        _ok("POST /v1/ws/tickets")

        # wait outbox → fanout (best-effort; relay must be running)
        await asyncio.sleep(1.5)
        manifest2 = await api(session, "GET", "/v1/sync/manifest", token=token)
        entry = next(
            (c for c in manifest2["conversations"] if c["conversationId"] == conversation_id),
            None,
        )
        _require(entry is not None, "manifest missing conversation")
        _require(entry["lastEventSeq"] >= edited["eventSeq"], "manifest lagging")
        _ok("manifest high-water after edits")

        # delete (tombstone)
        deleted = await api(
            session,
            "DELETE",
            f"/v1/conversations/{conversation_id}/messages/{message_id}",
            token=token,
        )
        _require(deleted.get("deletedAt") is not None, "tombstone missing deletedAt")
        _ok("DELETE message tombstone")

        # media upload initiate (membership ACL)
        upload = await api(
            session,
            "POST",
            "/v1/media/uploads",
            token=token,
            json_body={
                "filename": "e2e.bin",
                "contentType": "application/octet-stream",
                "size": 5,
                "target": {"type": "message", "conversationId": conversation_id},
            },
            expected=201,
        )
        _require(upload.get("uploadUrl"), "uploadUrl missing")
        _ok("POST /v1/media/uploads")

        # PUT to S3
        async with session.put(
            upload["uploadUrl"],
            data=b"hello",
            headers={"Content-Type": "application/octet-stream"},
        ) as put_resp:
            _require(put_resp.status in {200, 201, 204}, f"S3 PUT status={put_resp.status}")
            _ok("S3 PUT staging")

        asset = await api(
            session,
            "POST",
            f"/v1/media/uploads/{upload['uploadId']}/complete",
            token=token,
            expected=200,
        )
        status = str(asset.get("status") or "").lower()
        _require(status == "uploaded", f"status={status} body={asset}")
        _ok("POST media complete → uploaded")

        asset_id = asset["id"]
        for _ in range(60):
            polled = await api(
                session,
                "GET",
                f"/v1/media/{asset_id}",
                token=token,
            )
            status = str(polled.get("status") or "").lower()
            if status == "ready":
                asset = polled
                break
            if status == "rejected":
                raise AssertionError(f"media rejected: {polled!r}")
            await asyncio.sleep(0.5)
        else:
            raise AssertionError(f"media not ready after poll: status={status!r}")
        _ok("media worker → ready")

        access = await api(
            session,
            "POST",
            f"/v1/media/{asset['id']}/access",
            token=token,
            json_body={"role": "original"},
        )
        _require(access.get("url"), "access url missing")
        async with session.get(access["url"]) as get_resp:
            data = await get_resp.read()
            _require(get_resp.status == HTTPStatus.OK, f"download status={get_resp.status}")
            _require(data == b"hello", f"download body={data!r}")
            _ok("POST media access + GET object")

        # message with media block
        media_msg = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/messages",
            token=token,
            json_body={
                "clientMessageId": str(uuid.uuid4()),
                "blocks": [
                    {"type": "text", "text": "file attached"},
                    {"type": "media", "assetId": asset["id"]},
                ],
            },
            expected=201,
        )
        _require("blocks" in media_msg["content"], "media message content")
        _ok("POST message with media block")

        # reactions
        reaction = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/reactions",
            token=token,
            json_body={"messageId": media_msg["id"], "emoji": "👍"},
            expected=201,
        )
        _require(reaction["emoji"] == "👍", "reaction emoji")
        _ok("POST reaction")

        summary = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/messages/{media_msg['id']}/reactions",
            token=token,
        )
        _require(any(item["emoji"] == "👍" and item["count"] >= 1 for item in summary), "summary")
        _ok("GET reaction summary")

        # WebSocket live delivery (outbox relay must be running)
        ticket2 = await api(session, "POST", "/v1/ws/tickets", token=token, expected=201)
        ws = await session.ws_connect(f"{API_URL}/v1/ws?ticket={ticket2['ticket']}")
        # presence.changed may arrive immediately on connect (user room)
        sub_id = str(uuid.uuid4())
        await ws.send_json(
            {
                "id": sub_id,
                "type": "subscription.subscribe",
                "payload": {"topic": "conversation", "key": conversation_id},
            }
        )
        subscribed = False
        deadline = asyncio.get_running_loop().time() + 5
        while asyncio.get_running_loop().time() < deadline:
            sub_reply = await asyncio.wait_for(
                ws.receive(),
                timeout=max(0.1, deadline - asyncio.get_running_loop().time()),
            )
            if sub_reply.type != aiohttp.WSMsgType.TEXT:
                continue
            sub_payload = json.loads(sub_reply.data)
            if sub_payload.get("type") == "subscription.subscribed":
                subscribed = True
                break
        _require(subscribed, "timed out waiting for subscription.subscribed")
        _ok("WS subscribe conversation")

        # typing ack (ephemeral)
        typing_id = str(uuid.uuid4())
        await ws.send_json(
            {
                "id": typing_id,
                "type": "typing.started",
                "payload": {"conversationId": conversation_id},
            }
        )
        typing_ack = False
        deadline = asyncio.get_running_loop().time() + 5
        while asyncio.get_running_loop().time() < deadline:
            msg = await asyncio.wait_for(
                ws.receive(),
                timeout=max(0.1, deadline - asyncio.get_running_loop().time()),
            )
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue
            body = json.loads(msg.data)
            if body.get("type") == "typing.ack":
                typing_ack = True
                break
            if body.get("type") == "typing.updated":
                continue
        _require(typing_ack, "typing.ack missing")
        _ok("WS typing.started")

        live_client_id = str(uuid.uuid4())
        live_msg = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/messages",
            token=token,
            json_body={
                "clientMessageId": live_client_id,
                "blocks": [{"type": "text", "text": "live push"}],
            },
            expected=201,
        )
        deadline = asyncio.get_running_loop().time() + 10
        matched = False
        while asyncio.get_running_loop().time() < deadline:
            evt = await asyncio.wait_for(
                ws.receive(), timeout=max(0.1, deadline - asyncio.get_running_loop().time())
            )
            if evt.type != aiohttp.WSMsgType.TEXT:
                continue
            evt_payload = json.loads(evt.data)
            if (
                evt_payload.get("type") == "message.created"
                and evt_payload.get("payload", {}).get("messageId") == live_msg["id"]
            ):
                matched = True
                break
        _require(matched, "timed out waiting for WS message.created")
        _ok("WS message.created fanout")
        await ws.close()

        # snapshot body
        snapshot = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/snapshot?messageLimit=10",
            token=token,
        )
        _require(snapshot["conversation"]["id"] == conversation_id, "snapshot conversation id")
        _require(snapshot["snapshotEventSeq"] == snapshot["conversation"]["lastEventSeq"], "snapshot seq")
        _require(
            isinstance(snapshot["messages"], list) and len(snapshot["messages"]) >= 1, "snapshot messages"
        )
        _ok("GET conversation snapshot")

        # kick/leave → access.revoked (отдельная беседа, чтобы не ломать предыдущий контекст)
        leave_conv = await api(
            session,
            "POST",
            "/v1/conversations",
            token=token,
            json_body={"title": f"Leave {uuid.uuid4().hex[:6]}", "memberIds": []},
            expected=201,
        )
        leave_id = leave_conv["id"]
        members = await api(session, "GET", f"/v1/conversations/{leave_id}/members", token=token)
        _require(len(members) >= 1, "leave members empty")
        principal_id = members[0]["principalId"]

        ticket3 = await api(session, "POST", "/v1/ws/tickets", token=token, expected=201)
        ws2 = await session.ws_connect(f"{API_URL}/v1/ws?ticket={ticket3['ticket']}")
        sub_id2 = str(uuid.uuid4())
        await ws2.send_json(
            {
                "id": sub_id2,
                "type": "subscription.subscribe",
                "payload": {"topic": "conversation", "key": leave_id},
            }
        )
        subscribed2 = False
        deadline = asyncio.get_running_loop().time() + 5
        while asyncio.get_running_loop().time() < deadline:
            msg = await asyncio.wait_for(
                ws2.receive(),
                timeout=max(0.1, deadline - asyncio.get_running_loop().time()),
            )
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue
            body = json.loads(msg.data)
            if body.get("type") == "subscription.subscribed":
                subscribed2 = True
                break
        _require(subscribed2, "leave WS subscribe failed")

        await api(
            session,
            "DELETE",
            f"/v1/conversations/{leave_id}/members/{principal_id}",
            token=token,
            expected=204,
        )
        revoked = False
        member_removed = False
        deadline = asyncio.get_running_loop().time() + 10
        while asyncio.get_running_loop().time() < deadline and not (revoked and member_removed):
            evt = await asyncio.wait_for(
                ws2.receive(),
                timeout=max(0.1, deadline - asyncio.get_running_loop().time()),
            )
            if evt.type != aiohttp.WSMsgType.TEXT:
                continue
            payload = json.loads(evt.data)
            if payload.get("type") == "access.revoked":
                revoked = True
            if payload.get("type") == "member.removed":
                member_removed = True
        _require(member_removed, "timed out waiting for member.removed")
        _require(revoked, "timed out waiting for access.revoked")
        _ok("WS access.revoked on leave")
        await ws2.close()

        # ITSM: create ticket from chat + context link + preview
        itsm_conv = await api(
            session,
            "POST",
            "/v1/conversations",
            token=token,
            json_body={"title": f"ITSM {uuid.uuid4().hex[:6]}", "memberIds": []},
            expected=201,
        )
        itsm_id = itsm_conv["id"]
        created_ticket = await api(
            session,
            "POST",
            f"/v1/conversations/{itsm_id}/tickets",
            token=token,
            json_body={
                "title": f"E2E ticket {uuid.uuid4().hex[:6]}",
                "description": "Created from messenger e2e smoke",
                "ticketType": "Задача",
                "priority": "medium",
                "postResourceMessage": True,
            },
            expected=201,
        )
        _require(created_ticket.get("ticketId"), "ticketId missing")
        _require(
            created_ticket.get("link", {}).get("resourceId") == created_ticket["ticketId"], "link mismatch"
        )
        _ok("POST create ticket from chat")

        link = await api(session, "GET", f"/v1/conversations/{itsm_id}/context-link", token=token)
        _require(link["resourceId"] == created_ticket["ticketId"], "context link resource")
        _ok("GET context-link")

        preview = await api(
            session,
            "GET",
            (
                f"/v1/resources/preview?provider=dio-desk"
                f"&resourceType=ticket&resourceId={created_ticket['ticketId']}"
                f"&conversationId={itsm_id}"
            ),
            token=token,
        )
        _require(preview.get("number"), "preview number")
        _require(preview.get("title"), "preview title")
        _ok("GET resource preview")

        provision = await api(
            session,
            "POST",
            "/v1/service/context-conversations",
            token=token,
            json_body={
                "organizationId": "00000000-0000-0000-0000-000000000000",
                "context": {
                    "provider": "dio-desk",
                    "resourceType": "ticket",
                    "resourceId": str(uuid.uuid4()),
                },
                "title": f"Provisioned {uuid.uuid4().hex[:6]}",
                "memberIds": [],
                "createdBy": principal_id,
            },
        )
        _require(provision.get("created") is True, "provision created")
        _require(provision.get("conversationId"), "provision conversationId")
        # idempotent replay
        provision2 = await api(
            session,
            "POST",
            "/v1/service/context-conversations",
            token=token,
            json_body={
                "organizationId": "00000000-0000-0000-0000-000000000000",
                "context": {
                    "provider": "dio-desk",
                    "resourceType": "ticket",
                    "resourceId": provision["link"]["resourceId"],
                },
                "title": "ignored",
                "memberIds": [],
                "createdBy": principal_id,
            },
        )
        _require(provision2["created"] is False, "provision should be idempotent")
        _require(provision2["conversationId"] == provision["conversationId"], "provision same conversation")
        _ok("POST service provision context conversation")

        # --- Session 1–8 surface (verification plan P1) ---
        policy = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/policy",
            token=token,
        )
        _require("allowForwarding" in policy or "allow_forwarding" in policy, "policy shape")
        _ok("GET conversation policy")

        pin_target = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/messages",
            token=token,
            json_body={
                "clientMessageId": str(uuid.uuid4()),
                "blocks": [{"type": "text", "text": "pin me searchable-unique-e2e"}],
            },
            expected=201,
        )
        pin = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/pins",
            token=token,
            json_body={"messageId": pin_target["id"]},
            expected=201,
        )
        _require(pin.get("messageId") == pin_target["id"], "pin messageId")
        _ok("POST pin")

        search = await api(
            session,
            "GET",
            f"/v1/search/messages?q=searchable-unique-e2e&conversationId={conversation_id}",
            token=token,
        )
        hits = search.get("items") or search.get("results") or search
        _require(isinstance(hits, list) and len(hits) >= 1, f"search empty: {search}")
        _ok("GET search messages")

        delivery = await api(
            session,
            "PUT",
            f"/v1/conversations/{conversation_id}/delivery-cursor",
            token=token,
            json_body={"lastDeliveredMessageSeq": pin_target["createdSeq"]},
        )
        delivered = delivery.get("lastDeliveredMessageSeq") or delivery.get("last_delivered_message_seq")
        _require(delivered is not None and int(delivered) >= pin_target["createdSeq"], "delivery cursor")
        _ok("PUT delivery-cursor")

        suggestion = await api(
            session,
            "GET",
            f"/v1/conversations/{conversation_id}/messages/{pin_target['id']}/ticket-suggestion",
            token=token,
        )
        _require("suggested" in suggestion or "title" in suggestion, "suggestion shape")
        _ok("GET ticket-suggestion")

        thread = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/threads",
            token=token,
            json_body={"rootMessageId": pin_target["id"], "title": "e2e thread"},
            expected=201,
        )
        _require(thread.get("id"), "thread id")
        _ok("POST thread")

        from datetime import UTC, datetime, timedelta

        send_at = (datetime.now(UTC) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        scheduled = await api(
            session,
            "POST",
            f"/v1/conversations/{conversation_id}/scheduled-messages",
            token=token,
            json_body={
                "sendAt": send_at,
                "message": {
                    "clientMessageId": str(uuid.uuid4()),
                    "blocks": [{"type": "text", "text": "scheduled e2e"}],
                },
            },
            expected=201,
        )
        _require(scheduled.get("id"), "scheduled id")
        # cancel may return 204 or 200 with cancelled DTO depending on handler
        async with session.request(
            "DELETE",
            f"{API_URL}/v1/conversations/{conversation_id}/scheduled-messages/{scheduled['id']}",
            headers={"Authorization": f"Bearer {token}"},
        ) as cancel_resp:
            _require(cancel_resp.status in {200, 204}, f"cancel status={cancel_resp.status}")
        _ok("POST+DELETE scheduled-message")

        metrics = await api(session, "GET", "/v1/system/metrics", token=token)
        metrics_text = metrics if isinstance(metrics, str) else str(metrics)
        _require(
            "messenger_send_ack_latency_seconds" in metrics_text or "messenger_" in metrics_text,
            f"metrics empty: {metrics_text[:200]}",
        )
        _ok("GET /v1/system/metrics")

        conv_meta = await api(session, "GET", f"/v1/conversations/{conversation_id}", token=token)
        _require(
            "hasExternalMembers" in conv_meta or "has_external_members" in conv_meta, "hasExternalMembers"
        )
        _ok("GET conversation hasExternalMembers")

        print("\nALL SMOKE CHECKS PASSED")


def main() -> int:
    try:
        asyncio.run(run())
    except SmokeTestError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
