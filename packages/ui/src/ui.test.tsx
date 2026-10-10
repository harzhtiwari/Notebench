// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  cn,
  Button,
  buttonVariants,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./index.js";

describe("@notebook/ui Design System & Primitives", () => {
  // ==========================================================================
  // SEAM 1: UTILITY & STYLING TOKENS
  // ==========================================================================
  describe("Seam 1: cn utility", () => {
    it("merges class names and resolves tailwind conflicts", () => {
      const result = cn("p-4 text-sm", "p-2", false, null, undefined, "font-bold");
      expect(result).toBe("text-sm p-2 font-bold");
    });
  });

  // ==========================================================================
  // SEAM 2: ACTION & INPUT ATOMS (Button, Input)
  // ==========================================================================
  describe("Seam 2: Button & Input Atoms", () => {
    it("renders Button with default variant and responds to clicks", () => {
      let clicked = false;
      render(<Button onClick={() => { clicked = true; }}>Save changes</Button>);
      const btn = screen.getByRole("button", { name: "Save changes" });
      expect(btn).toBeDefined();
      fireEvent.click(btn);
      expect(clicked).toBe(true);
    });

    it("supports Button variants and sizes", () => {
      const { rerender } = render(
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      );
      const btn = screen.getByRole("button", { name: "Delete" });
      expect(btn.className).toContain("var(--nb-danger");

      rerender(
        <Button variant="outline" size="lg">
          Outline
        </Button>
      );
      expect(screen.getByRole("button", { name: "Outline" }).className).toContain("border");
      expect(buttonVariants({ variant: "ghost" })).toContain("hover:bg");
    });

    it("renders Button asChild via Radix Slot", () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );
      const link = screen.getByRole("link", { name: "Link Button" });
      expect(link.getAttribute("href")).toBe("/test");
    });

    it("renders disabled Button with disabled attribute", () => {
      render(<Button disabled>Disabled Action</Button>);
      const btn = screen.getByRole("button", { name: "Disabled Action" });
      expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("renders Input with placeholder and accepts value changes", () => {
      render(<Input placeholder="Type query..." defaultValue="Initial" />);
      const input = screen.getByPlaceholderText("Type query...") as HTMLInputElement;
      expect(input.value).toBe("Initial");
      fireEvent.change(input, { target: { value: "Updated" } });
      expect(input.value).toBe("Updated");
    });
  });

  // ==========================================================================
  // SEAM 3: CARD LAYOUT SEAM
  // ==========================================================================
  describe("Seam 3: Card Layout", () => {
    it("renders Card with header, title, description, content, and footer", () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Q3 Research</CardTitle>
            <CardDescription>Quarterly analysis report</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Body content goes here</p>
          </CardContent>
          <CardFooter>
            <span>Last updated 2 days ago</span>
          </CardFooter>
        </Card>
      );

      expect(screen.getByText("Q3 Research")).toBeDefined();
      expect(screen.getByText("Quarterly analysis report")).toBeDefined();
      expect(screen.getByText("Body content goes here")).toBeDefined();
      expect(screen.getByText("Last updated 2 days ago")).toBeDefined();
    });
  });

  // ==========================================================================
  // SEAM 4: MODAL & OVERLAY PRIMITIVES (Dialog, Tooltip, Popover)
  // ==========================================================================
  describe("Seam 4: Dialog, Tooltip, Popover", () => {
    it("opens Dialog on trigger click and exposes DialogTitle/DialogDescription", () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open Modal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modal Title</DialogTitle>
              <DialogDescription>Modal explanatory description</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button>Close Modal</Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText("Modal Title")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open Modal" }));
      expect(screen.getByText("Modal Title")).toBeDefined();
      expect(screen.getByText("Modal explanatory description")).toBeDefined();
    });

    it("renders Tooltip within TooltipProvider", () => {
      render(
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button>Hover Me</Button>
            </TooltipTrigger>
            <TooltipContent>Helpful tooltip text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      expect(screen.getByText("Helpful tooltip text")).toBeDefined();
    });

    it("renders Popover with trigger and open content", () => {
      render(
        <Popover open>
          <PopoverTrigger asChild>
            <Button>Open Popover</Button>
          </PopoverTrigger>
          <PopoverContent>Popover details</PopoverContent>
        </Popover>
      );

      expect(screen.getByText("Popover details")).toBeDefined();
    });
  });

  // ==========================================================================
  // SEAM 5: NAVIGATION & DISCLOSURE (DropdownMenu, Tabs, ScrollArea, Accordion)
  // ==========================================================================
  describe("Seam 5: DropdownMenu, Tabs, ScrollArea, Accordion", () => {
    it("renders DropdownMenu when open", () => {
      render(
        <DropdownMenu open>
          <DropdownMenuTrigger asChild>
            <Button>Options</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.getByText("Duplicate")).toBeDefined();
      expect(screen.getByText("Delete")).toBeDefined();
    });

    it("renders Tabs and switches active content with ARIA compliance", () => {
      render(
        <Tabs defaultValue="sources">
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="studio">Studio</TabsTrigger>
          </TabsList>
          <TabsContent value="sources">Sources Content Area</TabsContent>
          <TabsContent value="studio">Studio Content Area</TabsContent>
        </Tabs>
      );

      expect(screen.getByText("Sources Content Area")).toBeDefined();
      const studioTab = screen.getByRole("tab", { name: "Studio" });
      fireEvent.keyDown(studioTab, { key: "Enter" });
      expect(screen.getByText("Studio Content Area")).toBeDefined();
    });

    it("renders ScrollArea with viewport content", () => {
      render(
        <ScrollArea className="h-40">
          <div>Long scrollable list item 1</div>
          <div>Long scrollable list item 2</div>
        </ScrollArea>
      );

      expect(screen.getByText("Long scrollable list item 1")).toBeDefined();
    });

    it("renders Accordion with collapsible items", () => {
      render(
        <Accordion type="single" collapsible defaultValue="item-1">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1 Header</AccordionTrigger>
            <AccordionContent>Section 1 Body Text</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByText("Section 1 Header")).toBeDefined();
      expect(screen.getByText("Section 1 Body Text")).toBeDefined();
    });
  });
});
