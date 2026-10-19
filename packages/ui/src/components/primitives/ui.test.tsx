// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  Button,
  IconButton,
  buttonVariants,
  GearIcon,
  CopyIcon,
  Input,
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetContent,
  SheetFooter,
  Well,
  WellHeader,
  WellTitle,
  WellDescription,
  WellContent,
  WellFooter,
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
import { cn } from "../../lib/utils.js";

describe("@notebench/ui Design System & Primitives", () => {
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
  // SEAM 2: ACTION & INPUT ATOMS (Button, IconButton, Input)
  // ==========================================================================
  describe("Seam 2: Button, IconButton & Input Atoms", () => {
    it("renders Button with default variant (nb_btn_secondary) and responds to clicks", () => {
      let isClicked = false;
      render(<Button onClick={() => { isClicked = true; }}>Save changes</Button>);
      const btn = screen.getByRole("button", { name: "Save changes" });
      expect(btn).toBeDefined();
      expect(btn.className).toContain("var(--nb-sheet)");
      expect(btn.className).not.toContain("shadow-xs");
      fireEvent.click(btn);
      expect(isClicked).toBe(true);
    });

    it("supports Button nb_btn_* variants and strict token classes without shadow-xs", () => {
      const { rerender } = render(
        <Button variant="nb_btn_primary">
          Approve plan
        </Button>
      );
      const primaryBtn = screen.getByRole("button", { name: "Approve plan" });
      expect(primaryBtn.className).toContain("var(--nb-ink)");
      expect(primaryBtn.className).toContain("var(--nb-ink-inv)");
      expect(primaryBtn.className).not.toContain("shadow-xs");

      rerender(
        <Button variant="nb_btn_danger">
          Remove source
        </Button>
      );
      const dangerBtn = screen.getByRole("button", { name: "Remove source" });
      expect(dangerBtn.className).toContain("var(--nb-danger)");
      expect(dangerBtn.className).not.toContain("shadow-xs");

      rerender(
        <Button variant="nb_btn_ghost">
          History
        </Button>
      );
      const ghostBtn = screen.getByRole("button", { name: "History" });
      expect(ghostBtn.className).toContain("bg-transparent");
      expect(ghostBtn.className).not.toContain("shadow-xs");

      rerender(
        <Button variant="nb_btn_link">
          Learn more
        </Button>
      );
      const linkBtn = screen.getByRole("button", { name: "Learn more" });
      expect(linkBtn.className).toContain("var(--nb-link)");
      expect(linkBtn.className).not.toContain("shadow-xs");
    });

    it("supports Button 3 heights (nb_btn_sm: 28px, nb_btn_md: 36px, nb_btn_lg: 44px)", () => {
      const { rerender } = render(
        <Button size="nb_btn_sm">Small Button</Button>
      );
      const smBtn = screen.getByRole("button", { name: "Small Button" });
      expect(smBtn.className).toContain("var(--nb-size-control-sm)");

      rerender(<Button size="nb_btn_md">Medium Button</Button>);
      const mdBtn = screen.getByRole("button", { name: "Medium Button" });
      expect(mdBtn.className).toContain("var(--nb-size-control-md)");

      rerender(<Button size="nb_btn_lg">Large Button</Button>);
      const lgBtn = screen.getByRole("button", { name: "Large Button" });
      expect(lgBtn.className).toContain("var(--nb-size-control-lg)");
    });

    it("renders loading Button with aria-busy, disabled attribute, and spinner element", () => {
      render(
        <Button variant="nb_btn_primary" loading loadingLabel="Generating">
          Approve plan
        </Button>
      );
      const btn = screen.getByRole("button", { name: "Generating" });
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.hasAttribute("disabled")).toBe(true);
      const spinner = btn.querySelector(".spin");
      expect(spinner).not.toBeNull();
      expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    });

    it("renders Button with leadingIcon and trailingIcon", () => {
      render(
        <Button variant="nb_btn_secondary" leadingIcon={GearIcon} trailingIcon={CopyIcon}>
          Export
        </Button>
      );
      const btn = screen.getByRole("button", { name: "Export" });
      const svgs = btn.querySelectorAll("svg");
      expect(svgs.length).toBe(2);
      expect(svgs[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(svgs[1]?.getAttribute("aria-hidden")).toBe("true");
      expect(buttonVariants({ variant: "nb_btn_primary" })).toContain("var(--nb-ink)");
    });

    it("renders IconButton with required aria-label, square dimension, and active state", () => {
      const { rerender } = render(
        <IconButton
          variant="nb_btn_secondary"
          size="nb_btn_icon_md"
          icon={GearIcon}
          aria-label="Settings"
        />
      );
      const iconBtn = screen.getByRole("button", { name: "Settings" });
      expect(iconBtn).toBeDefined();
      expect(iconBtn.getAttribute("aria-label")).toBe("Settings");
      expect(iconBtn.className).toContain("var(--nb-size-control-md)");
      expect(iconBtn.querySelector("svg")).not.toBeNull();

      // Active state toggles aria-pressed and weight fill
      rerender(
        <IconButton
          variant="nb_btn_ghost"
          size="nb_btn_icon_sm"
          icon={CopyIcon}
          aria-label="Copy citation"
          active
        />
      );
      const activeBtn = screen.getByRole("button", { name: "Copy citation" });
      expect(activeBtn.getAttribute("aria-pressed")).toBe("true");
      expect(activeBtn.className).toContain("var(--nb-size-control-sm)");
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

    it("renders disabled Button with disabled attribute and board tokens", () => {
      render(<Button disabled>Disabled Action</Button>);
      const btn = screen.getByRole("button", { name: "Disabled Action" });
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(btn.className).toContain("var(--nb-disabled-bg)");
      expect(btn.className).toContain("var(--nb-disabled-fg)");
      expect(btn.className).toContain("disabled:cursor-not-allowed");
      expect(btn.className).not.toContain("disabled:pointer-events-none");
    });

    it("renders disabled nb_btn_link with transparent background and no border", () => {
      render(
        <Button variant="nb_btn_link" disabled>
          Disabled Link
        </Button>
      );
      const btn = screen.getByRole("button", { name: "Disabled Link" });
      expect(btn.className).toContain("disabled:bg-transparent");
      expect(btn.className).toContain("disabled:border-transparent");
    });

    it("ensures buttonVariants do not contain invalid pointer-coarse classes", () => {
      const smClasses = buttonVariants({ size: "nb_btn_sm" });
      expect(smClasses).not.toContain("pointer-coarse:");
      expect(smClasses).toContain("var(--nb-size-control-sm)");
    });

    it("renders Input with placeholder and accepts value changes", () => {
      render(<Input placeholder="Type query..." defaultValue="Initial" />);
      const input = screen.getByPlaceholderText<HTMLInputElement>("Type query...");
      expect(input.value).toBe("Initial");
      fireEvent.change(input, { target: { value: "Updated" } });
      expect(input.value).toBe("Updated");
    });
  });

  // ==========================================================================
  // SEAM 3: SURFACE PRIMITIVES (Sheet, Well)
  // ==========================================================================
  describe("Seam 3: Surface Layout (Sheet & Well)", () => {
    it("renders Sheet with header, title, description, content, and footer", () => {
      render(
        <Sheet>
          <SheetHeader>
            <SheetTitle>Q3 Research</SheetTitle>
            <SheetDescription>Quarterly analysis report</SheetDescription>
          </SheetHeader>
          <SheetContent>
            <p>Body content goes here</p>
          </SheetContent>
          <SheetFooter>
            <span>Last updated 2 days ago</span>
          </SheetFooter>
        </Sheet>
      );

      expect(screen.getByText("Q3 Research")).toBeDefined();
      expect(screen.getByText("Quarterly analysis report")).toBeDefined();
      expect(screen.getByText("Body content goes here")).toBeDefined();
      expect(screen.getByText("Last updated 2 days ago")).toBeDefined();
    });

    it("renders Well for sidebar/utility sections", () => {
      render(
        <Well>
          <WellHeader>
            <WellTitle>Active Sources</WellTitle>
            <WellDescription>3 sources selected</WellDescription>
          </WellHeader>
          <WellContent>
            <p>Source list item</p>
          </WellContent>
          <WellFooter>
            <span>Filter enabled</span>
          </WellFooter>
        </Well>
      );

      expect(screen.getByText("Active Sources")).toBeDefined();
      expect(screen.getByText("3 sources selected")).toBeDefined();
      expect(screen.getByText("Source list item")).toBeDefined();
      expect(screen.getByText("Filter enabled")).toBeDefined();
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
