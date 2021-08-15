import { recurse } from 'cypress-recurse';

Cypress.on('log:added', (logObject) => console.log(logObject));

context('Balance', () => {
  const authUrl = 'https://cognito-idp.ap-northeast-1.amazonaws.com/';
  let fetchedBalance;

  const cyInterceptBalance = (balance) => {
    cy.intercept('POST', '**/balance', (req) => {
      req.reply(202, {
        success: true,
        balance,
      });
    }).as('balancePost');
  };

  before(() => {
    cy.task('generateBalance').then((obj) => {
      fetchedBalance = obj;
    });
  });

  beforeEach(function () {
    cy.fixture('users.json').then((users) => {
      const { username, password } = users[0];
      cy.visit('/login');
      cy.fixture('users').should((users) => {
        const authorizedUser = users[0];

        expect('username' in authorizedUser).equal(true);
        expect('password' in authorizedUser).equal(true);
      });

      cy.get('#basic_username').type(username).should('have.value', username);
      cy.get('#basic_password').type(password).should('have.value', password);

      cy.on('uncaught:exception', (err, runnable) => false);
      cy.get('button').click();

      cy.intercept('POST', authUrl).as('authRequest');
      cy.wait('@authRequest', { timeout: 100000 }).wait('@authRequest', { timeout: 100000 });

      cy.get('[role="menuitem"]:first span:last a').should('contain', 'Balance').click();
    });
  });

  it('should load data from the correct API and make repeated API calls', () => {
    cy.intercept('POST', '**/list').as('transactionPost');
    return cy.wait('@transactionPost').then(({ _, response }) => {
      cy.get('@transactionPost.all').should('have.length', 1);

      expect(response.statusCode).equal(202);
      expect(response.url.endsWith('/transaction/list')).equal(true);

      cy.wait(3000);
      cy.get('@transactionPost.all').should((val) => {
        expect(val.length).greaterThan(1);
      });
    });
  });

  it('should ensure filtering works', () => {
    cyInterceptBalance({
      Count: fetchedBalance.length,
      Items: fetchedBalance,
      ScannedCount: fetchedBalance.length,
    });

    cy.reload();

    let filterItemsIndex = 0;
    recurse(
      () => {
        cy.get('span[class=ant-table-filter-trigger-container]:first').should('exist').click();

        return cy.get('.ant-table-filter-dropdown > ul > li').eq(filterItemsIndex);
      },
      () => {
        return filterItemsIndex > 10;
      },
      {
        post: () => {
          let currentFilteredCount = 0;

          cy.get('.ant-table-filter-dropdown > ul > li')
            .eq(filterItemsIndex)
            .click({ force: true })
            .find('input')
            .should('be.checked');

          return cy
            .get('.ant-table-filter-dropdown > ul > li')
            .eq(filterItemsIndex)
            .find('span')
            .last()
            .should(($span) => {
              const filteredBalance = fetchedBalance.filter(
                ({ currency }) => currency === $span.text(),
              );

              currentFilteredCount = filteredBalance.length;
            })
            .then(() => {
              cy.get('.ant-table-filter-dropdown-btns button:last span')
                .should('contain', 'OK')
                .click({ force: true });

              if (currentFilteredCount) {
                cy.get('tbody:first tr')
                  .should('have.length', currentFilteredCount)
                  .should('have.class', 'ant-table-row');
              } else {
                cy.get('tbody:first tr')
                  .should('have.length', 1)
                  .should('have.class', 'ant-table-placeholder');
              }

              cy.get('span[class=ant-table-filter-trigger-container]:first')
                .should('exist')
                .click();

              cy.get('.ant-table-filter-dropdown-btns button:first span')
                .should('contain', 'Reset')
                .click({ force: true });

              filterItemsIndex++;
            });
        },
        timeout: 200000,
      },
    );
  });

  it('should ensure pagination works', () => {
    cyInterceptBalance({
      Count: fetchedBalance.length,
      Items: fetchedBalance,
      ScannedCount: fetchedBalance.length,
    });

    cy.reload();

    const pickedIndex = Math.floor(Math.random() * 3);
    const pageLimit = [10, 20, 50][pickedIndex];

    cy.get('.ant-pagination-options-size-changer:first div').click();
    cy.get('.ant-select-item-option-content')
      .eq(pickedIndex)
      .should('contain', `${pageLimit} / page`)
      .click();

    let page = 1;

    recurse(
      () => cy.get('button[class=ant-pagination-item-link]:last'),
      (nextBtn) => {
        cy.get('.ant-pagination-item-active:first').should('contain', page);
        cy.get('tbody tr:last td:first').should(
          'contain',
          fetchedBalance[pageLimit * page - 1].username,
        );

        return nextBtn.prop('disabled');
      },
      {
        post: () => {
          page++;

          cy.get('button[class=ant-pagination-item-link]:last').click();
        },
        timeout: 60000,
      },
    );
  });

  it('should ensure searching works', () => {
    cyInterceptBalance({
      Count: fetchedBalance.length,
      Items: fetchedBalance,
      ScannedCount: fetchedBalance.length,
    });

    cy.get('input[class=ant-input]:first').type('not found').should('have.value', 'not found');

    cyInterceptBalance({
      Count: 0,
      Items: [],
      ScannedCount: 0,
    });

    return cy
      .get('.ant-input-search-button')
      .click()
      .then(() => {
        cy.get('tbody:first tr')
          .should('have.length', 1)
          .should('have.class', 'ant-table-placeholder');

        cyInterceptBalance({
          Count: fetchedBalance.length,
          Items: fetchedBalance,
          ScannedCount: fetchedBalance.length,
        });

        cy.get('input[class=ant-input]:first').next().click();
        cy.get('input[class=ant-input]:first').should('have.value', '');
        cy.get('tbody:first tr').should('have.length.gt', 1).should('have.class', 'ant-table-row');
      });
  });

  it('should ensure sorting works on username column', () => {
    const slicedFetchedBalance = fetchedBalance.slice(0, 10);
    const decendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.username < b.username ? 1 : -1,
    );
    const ascendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.username > b.username ? 1 : -1,
    );

    cyInterceptBalance({
      Count: slicedFetchedBalance.length,
      Items: slicedFetchedBalance,
      ScannedCount: slicedFetchedBalance.length,
    });

    cy.reload();
    cy.wait(5000);

    cy.get('span[class=ant-table-column-sorter-inner]:first > span').should(($sortArrowElems) => {
      expect($sortArrowElems[0].classList.contains('active')).equal(false);
      expect($sortArrowElems[1].classList.contains('active')).equal(false);
    });

    cy.get('.ant-table-column-sorters:first span:first').should('contain', 'username').click();

    cy.get('span[class=ant-table-column-sorter-inner]:first > span').should(($sortArrowElems) => {
      expect($sortArrowElems[0].classList.contains('active')).equal(false);
      expect($sortArrowElems[1].classList.contains('active')).equal(true);
    });

    cy.get('tbody tr td:first-child').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(decendingSortedBalance[index].username).equal(element.textContent);
      });
    });

    cy.get('.ant-table-column-sorters:first span:first').should('contain', 'username').click();

    cy.get('span[class=ant-table-column-sorter-inner]:first > span').should(($sortArrowElems) => {
      expect($sortArrowElems[0].classList.contains('active')).equal(true);
      expect($sortArrowElems[1].classList.contains('active')).equal(false);
    });

    cy.get('tbody tr td:first-child').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(ascendingSortedBalance[index].username).equal(element.textContent);
      });
    });
  });

  it('should ensure sorting works on available column', () => {
    const slicedFetchedBalance = fetchedBalance.slice(0, 10);
    const decendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.available < b.available ? 1 : -1,
    );
    const ascendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.available > b.available ? 1 : -1,
    );

    cyInterceptBalance({
      Count: slicedFetchedBalance.length,
      Items: slicedFetchedBalance,
      ScannedCount: slicedFetchedBalance.length,
    });

    cy.reload();
    cy.wait(5000);

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(1)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(false);
        expect($sortArrowElems[1].classList.contains('active')).equal(false);
      });

    cy.get('.ant-table-column-sorters')
      .eq(1)
      .find('span')
      .first()
      .should('contain', 'available')
      .click();

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(1)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(false);
        expect($sortArrowElems[1].classList.contains('active')).equal(true);
      });

    cy.get('tbody tr td:nth-child(3)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(decendingSortedBalance[index].available).equal(
          Number(element.textContent.replace(/,/g, '')),
        );
      });
    });

    cy.get('.ant-table-column-sorters')
      .eq(1)
      .find('span')
      .first()
      .should('contain', 'available')
      .click();

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(1)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(true);
        expect($sortArrowElems[1].classList.contains('active')).equal(false);
      });

    cy.get('tbody tr td:nth-child(3)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(ascendingSortedBalance[index].available).equal(
          Number(element.textContent.replace(/,/g, '')),
        );
      });
    });
  });

  it('should ensure sorting works on ledger column', () => {
    const slicedFetchedBalance = fetchedBalance.slice(0, 10);
    const ascendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.ledger > b.ledger ? 1 : -1,
    );
    const decendingSortedBalance = [...slicedFetchedBalance].sort((a, b) =>
      a.ledger < b.ledger ? 1 : -1,
    );

    cyInterceptBalance({
      Count: slicedFetchedBalance.length,
      Items: slicedFetchedBalance,
      ScannedCount: slicedFetchedBalance.length,
    });

    cy.reload();
    cy.wait(5000);

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(2)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(false);
        expect($sortArrowElems[1].classList.contains('active')).equal(false);
      });

    cy.get('.ant-table-column-sorters')
      .eq(2)
      .find('span')
      .first()
      .should('contain', 'ledger')
      .click();

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(2)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(false);
        expect($sortArrowElems[1].classList.contains('active')).equal(true);
      });

    cy.get('tbody tr td:nth-child(4)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(decendingSortedBalance[index].ledger).equal(
          Number(element.textContent.replace(/,/g, '')),
        );
      });
    });

    cy.get('.ant-table-column-sorters')
      .eq(2)
      .find('span')
      .first()
      .should('contain', 'ledger')
      .click();

    cy.get('span[class=ant-table-column-sorter-inner]')
      .eq(2)
      .find('span')
      .should(($sortArrowElems) => {
        expect($sortArrowElems[0].classList.contains('active')).equal(true);
        expect($sortArrowElems[1].classList.contains('active')).equal(false);
      });

    cy.get('tbody tr td:nth-child(4)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(ascendingSortedBalance[index].ledger).equal(
          Number(element.textContent.replace(/,/g, '')),
        );
      });
    });
  });
});
