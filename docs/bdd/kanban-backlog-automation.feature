Feature: KanbanTask Agent input must create cards through an ACP session
  In order to trust AI-driven planning on the Kanban page
  As a developer maintaining Routa
  I want card creation from the Kanban input box to be attributable to a real ACP session

  Background:
    Given the workspace has at least one linked repository
    And the Kanban page is open
    And the KanbanTask Agent provider is set to an ACP-capable provider

  Scenario: Typing a requirement starts a session before AI creates cards
    When I enter a unique requirement into the KanbanTask Agent input
    And I click "Send"
    Then the Kanban page should open or attach to an ACP session
    And the request should produce a non-empty session id
    And the corresponding session history should eventually become non-empty
    And the board UI should expose a "View session" action for the resulting card or cards

  Scenario: AI-created cards must be traceable to the session created by the input flow
    Given I submitted a KanbanTask Agent prompt from the input box
    When the ACP session analyzes the requirement
    Then any new card created from that requirement must be linked to the ACP session lifecycle
    And the created card should have a persisted trigger session id
    But card creation is invalid evidence if no ACP session was created first

  Scenario: Regression fails if a card appears without session evidence
    Given I submitted a Kanban agent prompt from the input box
    When a card appears on the Kanban board
    Then the regression must also verify that the session history endpoint for its trigger session id is non-empty
    And the regression must fail if the card exists but no session is visible in the UI or data model

  Scenario: Story decomposition must be initiated by AI rather than the manual issue dialog
    Given I want to create work from a natural-language requirement
    When I use the KanbanTask Agent input instead of the "Manual" dialog
    Then the ACP session should decide whether to create one or more cards
    And the regression should not treat manual card creation as coverage for this flow

  Scenario: Session UI should appear immediately after the Kanban input submits
    When I enter a unique requirement into the KanbanTask Agent input
    And I click "Send"
    Then the Kanban page should show the ACP session panel before the model finishes planning
    And the session panel should expose the current provider and stop controls immediately
    But the UI should not wait for the first assistant message before showing the session shell

  Scenario: Kanban input sessions should stay within Kanban and MCP operations
    Given I submitted a KanbanTask Agent prompt from the input box
    When the ACP session starts planning backlog work
    Then the session should use Kanban-relevant MCP operations to inspect or create cards
    And the session should not invoke native tools such as Skill, Bash, Read, Write, Edit, Glob, or Grep
    And the regression must fail if the visible session trace shows native tool calls for this flow

  Scenario: AI-created Kanban cards must not auto-create GitHub issues
    Given I submitted a Kanban agent prompt from the input box
    When the ACP session creates one or more backlog cards
    Then those cards must stay local to Routa unless a human explicitly opts into GitHub issue creation
    And the regression must fail if an AI-created card immediately receives a GitHub issue number or URL
