import { describe, expect, it } from "vitest";
import {
  buildPipelineAssigneeWhere,
  buildPipelineLeadWhere,
  parsePipelineSearchParams,
  type PipelineListQuery,
} from "@/lib/pipeline";
import {
  clampPipelinePage,
  parsePipelinePage,
  parsePipelinePageSize,
  pipelineListSkip,
  pipelineTotalPages,
} from "@/lib/pipeline-shared";

const baseQuery = (): PipelineListQuery => ({
  companyId: "co_1",
  currentUserId: "user_1",
  page: 1,
  pageSize: 25,
  stage: "all",
  assignee: "me",
});

describe("pipeline pagination helpers", () => {
  it("parses page and pageSize with sane defaults and clamps", () => {
    expect(parsePipelinePage(undefined)).toBe(1);
    expect(parsePipelinePage("0")).toBe(1);
    expect(parsePipelinePage("-3")).toBe(1);
    expect(parsePipelinePage("2.9")).toBe(2);
    expect(parsePipelinePage("abc")).toBe(1);

    expect(parsePipelinePageSize(undefined)).toBe(25);
    expect(parsePipelinePageSize("50")).toBe(50);
    expect(parsePipelinePageSize("100")).toBe(100);
    expect(parsePipelinePageSize("30")).toBe(25);
    expect(parsePipelinePageSize("200")).toBe(25);
  });

  it("computes skip, total pages, and clamps out-of-range pages", () => {
    expect(pipelineListSkip(1, 25)).toBe(0);
    expect(pipelineListSkip(2, 25)).toBe(25);
    expect(pipelineListSkip(3, 50)).toBe(100);

    expect(pipelineTotalPages(0, 25)).toBe(1);
    expect(pipelineTotalPages(25, 25)).toBe(1);
    expect(pipelineTotalPages(26, 25)).toBe(2);
    expect(pipelineTotalPages(100, 25)).toBe(4);

    expect(clampPipelinePage(1, 0, 25)).toBe(1);
    expect(clampPipelinePage(99, 40, 25)).toBe(2);
    expect(clampPipelinePage(0, 40, 25)).toBe(1);
  });

  it("parses search params into a validated list query", () => {
    expect(
      parsePipelineSearchParams(
        { stage: "quoted", assignee: "all", page: "3", pageSize: "50" },
        { companyId: "co_1", currentUserId: "user_1" },
      ),
    ).toEqual({
      companyId: "co_1",
      currentUserId: "user_1",
      page: 3,
      pageSize: 50,
      stage: "quoted",
      assignee: "all",
    });

    expect(
      parsePipelineSearchParams(
        { stage: "not-a-stage", page: "nope", pageSize: "7" },
        { companyId: "co_1", currentUserId: "user_1" },
      ),
    ).toEqual({
      companyId: "co_1",
      currentUserId: "user_1",
      page: 1,
      pageSize: 25,
      stage: "all",
      assignee: "me",
    });
  });

  it("builds assignee and full list where clauses", () => {
    expect(buildPipelineAssigneeWhere(baseQuery())).toEqual({
      assignedUserId: "user_1",
    });
    expect(
      buildPipelineAssigneeWhere({ ...baseQuery(), assignee: "all" }),
    ).toEqual({});
    expect(
      buildPipelineAssigneeWhere({ ...baseQuery(), assignee: "unassigned" }),
    ).toEqual({ assignedUserId: null });
    expect(
      buildPipelineAssigneeWhere({
        ...baseQuery(),
        assignee: "user_other",
      }),
    ).toEqual({ assignedUserId: "user_other" });

    expect(
      buildPipelineLeadWhere({
        ...baseQuery(),
        stage: "contacted",
        assignee: "all",
      }),
    ).toEqual({
      companyId: "co_1",
      stage: "contacted",
    });

    expect(
      buildPipelineLeadWhere({
        ...baseQuery(),
        stage: "won",
        assignee: "me",
      }),
    ).toEqual({
      companyId: "co_1",
      assignedUserId: "user_1",
      stage: "won",
    });
  });
});
