// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DocKindBadge } from "./doc-kind-badge"

describe("DocKindBadge", () => {
  it("renders PDF label", () => {
    render(<DocKindBadge kind="pdf" />)
    expect(screen.getByText("PDF")).toBeInTheDocument()
  })

  it("renders IMG label for image", () => {
    render(<DocKindBadge kind="image" />)
    expect(screen.getByText("IMG")).toBeInTheDocument()
  })

  it("renders DOC label", () => {
    render(<DocKindBadge kind="doc" />)
    expect(screen.getByText("DOC")).toBeInTheDocument()
  })

  it("renders LINK label", () => {
    render(<DocKindBadge kind="link" />)
    expect(screen.getByText("LINK")).toBeInTheDocument()
  })
})
