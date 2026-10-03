Feature: Kanban session queue
  To avoid exhausting limited ACP providers and coding agents
  As a workspace user
  I want Kanban automation to queue excess cards and cap concurrent sessions per board

  Scenario: Later cards wait when the board concurrency limit is reached
    Given the default Kanban board has session concurrency limit 1
    And backlog automation is enabled for the board
    When I create two backlog cards that both trigger ACP sessions
    Then the first card should get a trigger session immediately
    And the second card should stay in the same column with a queued indicator
    And the board summary should show 1 running session and 1 queued card

  Scenario: A queued card starts after an earlier card finishes
    Given the default Kanban board has session concurrency limit 1
    And the first backlog card already has a running ACP session
    And the second backlog card is queued
    When the first ACP session completes successfully
    Then the queued card should receive its own trigger session
    And the board summary should eventually show 1 running session and 0 queued cards
