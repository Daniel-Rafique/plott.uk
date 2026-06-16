import { describe, it, expect } from "vitest";
import {
  bboxToPolygonWkt,
  bboxTooLargeError,
  clampBboxToSearchable,
  isBboxSearchable,
  parseWktPoint,
} from "@/lib/planning-data";

describe("planning-data geometry helpers", () => {
  it("parses WKT POINT correctly", () => {
    expect(parseWktPoint("POINT(-0.1276 51.5074)")).toEqual({
      lng: -0.1276,
      lat: 51.5074,
    });
    expect(parseWktPoint("POINT (1.5 2.5)")).toEqual({ lng: 1.5, lat: 2.5 });
    expect(parseWktPoint(undefined)).toBeNull();
    expect(parseWktPoint("garbage")).toBeNull();
  });

  it("builds a closed WKT polygon for a bbox", () => {
    const wkt = bboxToPolygonWkt(0, 0, 1, 1);
    expect(wkt).toBe("POLYGON((0 0,1 0,1 1,0 1,0 0))");
  });

  it("flags oversized bboxes but accepts small ones", () => {
    // ~0.02° × 0.02° neighbourhood — well under MAX_BBOX_AREA_SQ_DEG (0.0009)
    expect(bboxTooLargeError(-0.12, 51.5, -0.1, 51.52)).toBeNull();
    expect(bboxTooLargeError(-1, 50, 1, 52)).toMatch(/too large/);
  });

  it("clampBboxToSearchable leaves small bboxes unchanged", () => {
    const b = { west: -0.12, south: 51.5, east: -0.1, north: 51.52 };
    expect(clampBboxToSearchable(b)).toEqual(b);
  });

  it("clampBboxToSearchable shrinks huge bboxes to max searchable square", () => {
    const huge = { west: -1, south: 50, east: 1, north: 52 };
    const c = clampBboxToSearchable(huge);
    expect(isBboxSearchable(c.west, c.south, c.east, c.north)).toBe(true);
    expect(bboxTooLargeError(c.west, c.south, c.east, c.north)).toBeNull();
    expect((c.west + c.east) / 2).toBeCloseTo((huge.west + huge.east) / 2, 6);
    expect((c.south + c.north) / 2).toBeCloseTo((huge.south + huge.north) / 2, 6);
  });
});
