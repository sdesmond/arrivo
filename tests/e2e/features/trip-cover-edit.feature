Feature: Trip Cover Image Edit

  Background:
    Given I am signed in

  @reseed-cover-image
  Scenario: User removes a trip cover image
    Given I have an existing trip
    When I open the trip edit sheet
    And I click the Remove image button
    And I save
    Then the cover image is cleared after reloading the page

  @reseed-cover-image
  Scenario: User edits a trip cover image
    Given I have an existing trip
    When I open the trip edit sheet
    And I select a new cover image from the picker
    And I save
    Then the new cover image is shown after reloading the page
