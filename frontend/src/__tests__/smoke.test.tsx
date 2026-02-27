import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import Login from "../pages/Login";

test("renders login screen", () => {
  render(
    <MemoryRouter>
      <Login onLogin={() => {}} />
    </MemoryRouter>
  );
  expect(screen.getByText(/jira quality command center/i)).toBeInTheDocument();
});
