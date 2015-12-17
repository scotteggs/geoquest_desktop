'use strict';
window.app = angular.module('GeoQuest', ['fsaPreBuilt', 'ui.router', 'ui.sortable', 'ui.bootstrap', 'ngAnimate', 'leaflet-directive']);

app.config(function ($urlRouterProvider, $locationProvider) {
    // This turns off hashbang urls (/#about) and changes it to something normal (/about)
    $locationProvider.html5Mode(true);
    // If we go to a URL that ui-router doesn't have registered, go to the "/" url.
    $urlRouterProvider.otherwise('/dashboard');
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state) {

    // The given state requires an authenticated user.
    var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
        return state.data && state.data.authenticate;
    };

    // $stateChangeStart is an event fired
    // whenever the process of changing a state begins.
    $rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

        if (!destinationStateRequiresAuth(toState)) {
            // The destination state does not require authentication
            // Short circuit with return.
            return;
        }

        if (AuthService.isAuthenticated()) {
            // The user is authenticated.
            // Short circuit with return.
            return;
        }

        // Cancel navigating to new state.
        event.preventDefault();

        AuthService.getLoggedInUser().then(function (user) {
            // If a user is retrieved, then renavigate to the destination
            // (the second time, AuthService.isAuthenticated() will work)
            // otherwise, if no user is logged in, go to "login" state.
            if (user) {
                $state.go(toState.name, toParams);
            } else {
                $state.go('login');
            }
        });
    });
});

app.config(function ($stateProvider) {

    $stateProvider.state('home', {
        url: '/',
        templateUrl: 'js/home/home.html',
        controller: 'HomeCtrl',
        resolve: {
            requestedUser: function requestedUser(AuthService) {
                return AuthService.getLoggedInUser();
            }
        }
    });
});

app.controller('HomeCtrl', function ($scope, AuthService, $state, requestedUser) {
    // If there's a logged in user upon load, go to the dashboard
    if (requestedUser) $state.go('dashboard', { userId: requestedUser._id });

    $scope.home = true; // To know what nav links to show
    $scope.login = {};
    $scope.signup = {};
    $scope.loginError = null;
    $scope.signupError = null;

    $scope.sendLogin = function (loginInfo) {
        $scope.error = null;

        AuthService.login(loginInfo).then(function (user) {
            $state.go('dashboard', { userId: user._id });
        })['catch'](function () {
            $scope.error = "I think you\'ve entered the wrong info, friend";
        });
    };

    $scope.sendSignup = function (signupInfo) {
        $scope.error = null;
        AuthService.signup(signupInfo).then(function (user) {
            $state.go('dashboard', { userId: user._id }, { reload: true });
        })['catch'](function () {
            $scope.error = "I'm afraid we already have someone by that name";
        });
    };

    // Paralax effect for images
    $(function () {
        // Cache the window object (makes load time faster)
        var $window = $(window);
        // Parallax background effect
        $('section[data-type="background"]').each(function () {
            var $bgobj = $(this); // assigning the object
            $(window).scroll(function () {
                //scroll the background at var speed
                // the yPos is a negative because we're scrolling it up
                var yPos = -($window.scrollTop() / $bgobj.data('speed'));
                // Put together our final background position
                var coords = '50% ' + yPos + 'px';
                // Move the background
                $bgobj.css({ backgroundPosition: coords });
            }); // end window scroll
        });
    });
});
(function () {

    'use strict';

    // Hope you didn't forget Angular! Duh-doy.
    if (!window.angular) throw new Error('I can\'t find Angular!');

    var app = angular.module('fsaPreBuilt', []);

    app.factory('Socket', function () {
        if (!window.io) throw new Error('socket.io not found!');
        return window.io(window.location.origin);
    });

    // AUTH_EVENTS is used throughout our app to
    // broadcast and listen from and to the $rootScope
    // for important events about authentication flow.
    app.constant('AUTH_EVENTS', {
        loginSuccess: 'auth-login-success',
        loginFailed: 'auth-login-failed',
        logoutSuccess: 'auth-logout-success',
        sessionTimeout: 'auth-session-timeout',
        notAuthenticated: 'auth-not-authenticated',
        notAuthorized: 'auth-not-authorized'
    });

    app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
        var statusDict = {
            401: AUTH_EVENTS.notAuthenticated,
            403: AUTH_EVENTS.notAuthorized,
            419: AUTH_EVENTS.sessionTimeout,
            440: AUTH_EVENTS.sessionTimeout
        };
        return {
            responseError: function responseError(response) {
                $rootScope.$broadcast(statusDict[response.status], response);
                return $q.reject(response);
            }
        };
    });

    app.config(function ($httpProvider) {
        $httpProvider.interceptors.push(['$injector', function ($injector) {
            return $injector.get('AuthInterceptor');
        }]);
    });
    app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q) {

        function onSuccessfulLogin(response) {
            var data = response.data;
            Session.create(data.id, data.user);
            $rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
            return data.user;
        }

        // Uses the session factory to see if an
        // authenticated user is currently registered.
        this.isAuthenticated = function () {
            return !!Session.user;
        };

        this.getLoggedInUser = function (fromServer) {

            // If an authenticated session exists, we
            // return the user attached to that session
            // with a promise. This ensures that we can
            // always interface with this method asynchronously.

            // Optionally, if true is given as the fromServer parameter,
            // then this cached value will not be used.

            if (this.isAuthenticated() && fromServer !== true) {
                return $q.when(Session.user);
            }

            // Make request GET /session.
            // If it returns a user, call onSuccessfulLogin with the response.
            // If it returns a 401 response, we catch it and instead resolve to null.
            return $http.get('/session').then(onSuccessfulLogin)['catch'](function () {
                return null;
            });
        };

        this.login = function (credentials) {
            return $http.post('/login', credentials).then(onSuccessfulLogin)['catch'](function () {
                return $q.reject({ message: 'Invalid login credentials.' });
            });
        };

        this.signup = function (credentials) {
            //sends a post request containing the user's credentials to
            return $http.post('api/users/signup', credentials)
            //once the user has been created on the backend...
            .then(function (response) {
                //a second post request is created to log the user in
                return $http.post('/login', credentials);
            }).then(onSuccessfulLogin)['catch'](function () {
                return $q.reject({ message: 'Invalid signup credentials.' });
            });
        };

        this.logout = function () {
            return $http.get('/logout').then(function () {
                Session.destroy();
                $rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
            });
        };
    });

    app.service('Session', function ($rootScope, AUTH_EVENTS) {

        var self = this;

        $rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
            self.destroy();
        });

        $rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
            self.destroy();
        });

        this.id = null;
        this.user = null;

        this.create = function (sessionId, user) {
            this.id = sessionId;
            this.user = user;
        };

        this.destroy = function () {
            this.id = null;
            this.user = null;
        };
    });
})();

app.config(function ($stateProvider) {
    $stateProvider.state('editor', {
        url: '/editor/:id',
        templateUrl: 'js/quest-editor/editor.html',
        controller: 'EditorCtrl',
        resolve: {
            quest: function quest(QuestFactory, $stateParams) {
                return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
            }
        },
        data: {
            authenticate: true
        }
    });
});

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory) {
    //variable saved to show/hide quest editor when editing individual states
    $rootScope.editorVisible = true;
    $scope.quest = quest;
    $scope.newQuest = false;
    //if there is no new quest, set properties
    if (!quest) {
        $scope.newQuest = true;
        $scope.quest = {
            start: [40.723008, -74.0006327]
        };
    }
    //update quest and go to dashboard for current user
    $scope.saveQuest = function () {
        if (!$scope.newQuest) {
            return QuestFactory.save($scope.quest).then(function () {
                $state.go('dashboard', { userId: Session.user._id });
            });
        } else {
            return QuestFactory.saveNew($scope.quest).then(function () {
                $state.go('dashboard', { userId: Session.user._id });
            });
        }
    };
    //go to mapStates editor and hide Quest editor
    $scope.transitionToMapStateEditor = function () {
        if (!$scope.newQuest) {
            return QuestFactory.save($scope.quest).then(function () {
                if ($scope.quest.questSteps.length === 0) {
                    $state.go('editor.questStep', { questStepId: null });
                } else {
                    $state.go('editor.questStep', { questStepId: $scope.quest.questSteps[0]._id });
                }
                $scope.editorVisible = false;
            });
        } else {
            return QuestFactory.saveNew($scope.quest).then(function (savedQuest) {
                $scope.editorVisible = false;
                $state.go('editor.questStep', { id: savedQuest._id, questStepId: null });
            });
        }
    };

    //***********  MAP FUNCTIONS BELOW  ***********************
    var questMap = L.map('quest-map').setView($scope.quest.start, 13);

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        maxZoom: 18,
        id: 'scotteggs.o7614jl2',
        accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
    }).addTo(questMap);

    var drawnItems = new L.FeatureGroup();
    questMap.addLayer(drawnItems);

    // Initialise the draw control and pass it the FeatureGroup of editable layers
    var drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            polygon: false,
            rectangle: false,
            circle: false
        },
        edit: {
            featureGroup: drawnItems
        }
    });

    questMap.addControl(drawControl);

    var marker = L.marker($scope.quest.start, { draggable: true });
    questMap.addLayer(marker);

    questMap.on('draw:created', function (e) {
        //	remove any existing markers
        if (marker) questMap.removeLayer(marker);
        var type = e.layerType;
        var layer = e.layer;
        //save start location of new marker
        $scope.quest.start = [layer._latlng.lat, layer._latlng.lng];
        //create marker and add to map
        marker = L.marker([layer._latlng.lat, layer._latlng.lng], { draggable: true });
        questMap.addLayer(marker);
    });

    marker.on('dragend', function (e) {
        $scope.quest.start = [e.target._latlng.lat, e.target._latlng.lng];
    });

    if ($scope.newQuest) {
        questMap.locate().on('locationfound', function (e) {
            questMap.setView([e.latitude, e.longitude], 14);
            marker.setLatLng([e.latitude, e.longitude]);
            $scope.quest.start = [e.latitude, e.longitude];
        });
    }
});
app.config(function ($stateProvider) {
    $stateProvider.state('editor.questStep', {
        url: '/queststep/:questStepId',
        templateUrl: 'js/quest-step-editor/quest-step-editor.html',
        controller: 'QuestStepEditController',
        resolve: {
            quest: function quest(QuestFactory, $stateParams) {
                return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
            }
        },
        data: {
            authenticate: true
        }
    });
});

app.controller('QuestStepEditController', function ($stateParams, $scope, $state, $rootScope, quest, QuestFactory) {
    $scope.quest = quest;
    $rootScope.editorVisible = false;
    //defind new Step for adding to steps array
    $scope.newStep = {
        name: 'New Step',
        targetCircle: {
            center: [],
            radius: null
        }
    };
    //if we have steps, find the index of the step that which matches the params
    if ($scope.quest.questSteps.length > 0) {
        $scope.quest.questSteps.forEach(function (step, index) {
            if (step._id === $stateParams.questStepId) {
                $scope.quest.idx = index;
            }
        });
        //sets currentStep to that matching the parameters
        $scope.currentStep = $scope.quest.questSteps[$scope.quest.idx];
    } else {
        $scope.quest.questSteps.push($scope.newStep);
        $scope.currentStep = $scope.quest.questSteps[0];
    }
    //function to switch states within mapState editor
    $scope.switchStep = function (clickedStep) {
        QuestFactory.save($scope.quest).then(function () {
            // redirect to the clicked mapstate
            $state.go('editor.questStep', { questStepId: clickedStep._id });
        });
    };
    $scope.saveQuestSteps = function () {
        //updates current mapState
        QuestFactory.save($scope.quest).then(function (updatedQuest) {
            $scope.quest = updatedQuest;
            $state.go('editor', { id: $scope.quest._id }, { reload: true });
        });
    };
    $scope.returnWithoutSaving = function () {
        $state.go('editor', { id: $scope.quest._id }, { reload: true });
    };
    $scope.addQuestStep = function () {
        $scope.quest.questSteps.push($scope.newStep);
        return QuestFactory.save($scope.quest).then(function (updatedQuest) {
            $scope.quest = updatedQuest;
            $state.go('editor.questStep', { questStepId: $scope.quest.questSteps[$scope.quest.questSteps.length - 1]._id });
        });
    };
    $scope.removeQuestStep = function () {
        var index = $scope.quest.questSteps.indexOf($scope.currentStep);
        $scope.quest.questSteps.splice(index, 1);
        if (index === $scope.quest.questSteps.length) index--;
        return QuestFactory.save($scope.quest).then(function (updatedQuest) {
            $scope.quest = updatedQuest;
            var stepDestination = $scope.quest.questSteps.length === 0 ? null : $scope.quest.questSteps[index]._id;
            $state.go('editor.questStep', { questStepId: stepDestination }, { reload: true });
        });
    };

    // //function to set map to either target region or map starting point if no target region
    var mapView = function mapView() {

        if ($scope.currentStep.targetCircle.center.length === 2) {
            return $scope.currentStep.targetCircle.center;
        } else {
            return $scope.quest.start;
        }
    };
    // //initialize map and set view using mapView function
    var questStepMap = L.map('quest-step-map').setView(mapView(), 15);
    //add pirate map tiles
    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
        maxZoom: 18,
        id: 'scotteggs.o7614jl2',
        accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
    }).addTo(questStepMap);

    // Initialize the FeatureGroup to store editable layers
    var drawnItems = new L.FeatureGroup();
    questStepMap.addLayer(drawnItems);

    // Initialize the draw control and pass it the FeatureGroup of editable layers
    var drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            polygon: false,
            rectangle: false,
            marker: false
        },
        edit: {
            featureGroup: drawnItems
        }
    });
    questStepMap.addControl(drawControl);
    //if there is a target region, draw it on the map
    if ($scope.currentStep.targetCircle.center.length === 2) {
        var currentRegion = L.circle($scope.currentStep.targetCircle.center, $scope.currentStep.targetCircle.radius);
        questStepMap.addLayer(currentRegion);
    }
    var circle;
    questStepMap.on('draw:created', function (e) {
        //remove the loaded region then remove any newly drawn circles
        if (currentRegion) questStepMap.removeLayer(currentRegion);
        if (circle) questStepMap.removeLayer(circle);
        var type = e.layerType;
        var layer = e.layer;
        //assign target region to properties of drawn object
        $scope.currentStep.targetCircle.center = [layer._latlng.lat, layer._latlng.lng];
        $scope.currentStep.targetCircle.radius = layer._mRadius;
        //declare new object based on propertied drawn and add to map
        circle = L.circle([layer._latlng.lat, layer._latlng.lng], layer._mRadius);
        questStepMap.addLayer(circle);
    });
});

app.config(function ($stateProvider) {
    $stateProvider.state('dashboard', {
        url: '/dashboard/:userId',
        templateUrl: 'js/user-dashboard/dashboard.html',
        controller: 'DashCtrl',
        resolve: {
            userQuests: function userQuests(QuestFactory, $stateParams) {
                return QuestFactory.getUserQuests($stateParams.userId);
            }
        },
        data: {
            authenticate: true
        }
    });
});

app.controller('DashCtrl', function ($state, $scope, userQuests, Session, QuestFactory) {
    $scope.quests = [];
    $scope.quests = userQuests.map(function (g) {
        g.showDetail = false;
        return g;
    });
    $scope.goToEditor = function (questClicked) {
        $state.go('editor', { id: questClicked._id }, { reload: true });
    };
    $scope.deleteQuest = function (questClicked) {
        return QuestFactory['delete'](questClicked).then(function (deletedQuest) {
            $state.go('dashboard', { userId: Session.user._id }, { reload: true });
        });
    };
    $scope.parentClick = function (index) {
        var quest = $scope.quests[index];
        quest.showDetail = !quest.showDetail;
    }, $scope.switchActive = function (questClicked) {
        QuestFactory.save(questClicked);
    };
});
app.factory('QuestFactory', function ($http, Session) {

    return {

        getAllQuests: function getAllQuests() {
            return $http.get('/api/quests').then(function (res) {
                return res.data;
            });
        },
        getOneQuest: function getOneQuest(questId) {
            return $http.get('/api/quests/' + questId).then(function (res) {
                return res.data;
            });
        },
        getUserQuests: function getUserQuests(userId) {
            return $http.get('/api/quests/userquests/' + userId).then(function (res) {
                return res.data;
            });
        },
        save: function save(quest) {
            return $http.put('/api/quests/' + quest._id, quest).then(function (res) {
                return res.data;
            });
        },
        saveNew: function saveNew(quest) {
            quest.author = Session.user._id;
            return $http.post('/api/quests/', quest).then(function (res) {
                return res.data;
            });
        },
        'delete': function _delete(quest) {
            return $http['delete']('/api/quests/' + quest._id);
        }
    };
});

app.directive('fullstackLogo', function () {
    return {
        restrict: 'E',
        templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
    };
});
app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

    return {
        restrict: 'E',
        scope: {
            home: '='
        },
        templateUrl: 'js/common/directives/navbar/navbar.html',
        link: function link(scope) {

            scope.items = [{ label: 'Dashboard', state: 'home', auth: true }, { label: 'New Quest', state: 'editor', auth: true }];

            scope.user = null;

            scope.isLoggedIn = function () {
                return AuthService.isAuthenticated();
            };

            scope.logout = function () {
                AuthService.logout().then(function () {
                    $state.go('home');
                });
            };

            var setUser = function setUser() {
                AuthService.getLoggedInUser().then(function (user) {
                    scope.user = user;
                });
            };

            var removeUser = function removeUser() {
                scope.user = null;
            };

            setUser();

            $rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
            $rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
            $rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

            // Pretty Scrolling Navbar Effect
            $(window).scroll(function () {
                if ($('.navbar').offset().top > 50) {
                    $('.navbar-fixed-top').addClass('top-nav-collapse');
                } else {
                    $('.navbar-fixed-top').removeClass('top-nav-collapse');
                }
            });

            // Animated Scroll To Section
            $(function () {
                $('.page-scroll a').bind('click', function () {
                    var $anchor = $(this);
                    $('html, body').stop().animate({
                        scrollTop: $($anchor.attr('href')).offset().top
                    }, 1500, 'easeInOutExpo');
                    event.preventDefault();
                });
            });
        }

    };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImhvbWUvaG9tZS5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9mdWxsc3RhY2stbG9nby9mdWxsc3RhY2stbG9nby5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLEdBQUEsR0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsRUFBQSxDQUFBLGFBQUEsRUFBQSxXQUFBLEVBQUEsYUFBQSxFQUFBLGNBQUEsRUFBQSxXQUFBLEVBQUEsbUJBQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGtCQUFBLEVBQUEsaUJBQUEsRUFBQTs7QUFFQSxxQkFBQSxDQUFBLFNBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTs7QUFFQSxzQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7O0FBR0EsR0FBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOzs7QUFHQSxRQUFBLDRCQUFBLEdBQUEsU0FBQSw0QkFBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLGVBQUEsS0FBQSxDQUFBLElBQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQTtLQUNBLENBQUE7Ozs7QUFJQSxjQUFBLENBQUEsR0FBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBLFFBQUEsRUFBQTs7QUFFQSxZQUFBLENBQUEsNEJBQUEsQ0FBQSxPQUFBLENBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7QUFFQSxZQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsRUFBQTs7O0FBR0EsbUJBQUE7U0FDQTs7O0FBR0EsYUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBOzs7O0FBSUEsZ0JBQUEsSUFBQSxFQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTthQUNBLE1BQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQSxDQUFBO0tBRUEsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQ2xEQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsS0FBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxHQUFBO0FBQ0EsbUJBQUEsRUFBQSxtQkFBQTtBQUNBLGtCQUFBLEVBQUEsVUFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLHlCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsdUJBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO2FBQ0E7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsRUFBQTs7QUFFQSxRQUFBLGFBQUEsRUFBQSxNQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxhQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsVUFBQSxTQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsS0FBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxtQkFBQSxDQUFBLEtBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsZ0RBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUVBLENBQUE7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLGlEQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7QUFHQSxLQUFBLENBQUEsWUFBQTs7QUFFQSxZQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsU0FBQSxDQUFBLGlDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLGdCQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLG9CQUFBLElBQUEsR0FBQSxFQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsR0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsb0JBQUEsTUFBQSxHQUFBLE1BQUEsR0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDbEVBLENBQUEsWUFBQTs7QUFFQSxnQkFBQSxDQUFBOzs7QUFHQSxRQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHdCQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLEdBQUEsR0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLGFBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsT0FBQSxDQUFBLFFBQUEsRUFBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLEVBQUEsTUFBQSxJQUFBLEtBQUEsQ0FBQSxzQkFBQSxDQUFBLENBQUE7QUFDQSxlQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7Ozs7QUFLQSxPQUFBLENBQUEsUUFBQSxDQUFBLGFBQUEsRUFBQTtBQUNBLG9CQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLG1CQUFBO0FBQ0EscUJBQUEsRUFBQSxxQkFBQTtBQUNBLHNCQUFBLEVBQUEsc0JBQUE7QUFDQSx3QkFBQSxFQUFBLHdCQUFBO0FBQ0EscUJBQUEsRUFBQSxxQkFBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsT0FBQSxDQUFBLGlCQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQTtBQUNBLFlBQUEsVUFBQSxHQUFBO0FBQ0EsZUFBQSxFQUFBLFdBQUEsQ0FBQSxnQkFBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsYUFBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsY0FBQTtBQUNBLGVBQUEsRUFBQSxXQUFBLENBQUEsY0FBQTtTQUNBLENBQUE7QUFDQSxlQUFBO0FBQ0EseUJBQUEsRUFBQSx1QkFBQSxRQUFBLEVBQUE7QUFDQSwwQkFBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTthQUNBO1NBQ0EsQ0FBQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsYUFBQSxFQUFBO0FBQ0EscUJBQUEsQ0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLENBQ0EsV0FBQSxFQUNBLFVBQUEsU0FBQSxFQUFBO0FBQ0EsbUJBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7U0FDQSxDQUNBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxpQkFBQSxpQkFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLGdCQUFBLElBQUEsR0FBQSxRQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsbUJBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7QUFDQSxtQkFBQSxJQUFBLENBQUEsSUFBQSxDQUFBO1NBQ0E7Ozs7QUFJQSxZQUFBLENBQUEsZUFBQSxHQUFBLFlBQUE7QUFDQSxtQkFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLGdCQUFBLElBQUEsQ0FBQSxlQUFBLEVBQUEsSUFBQSxVQUFBLEtBQUEsSUFBQSxFQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7YUFDQTs7Ozs7QUFLQSxtQkFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBRUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsS0FBQSxHQUFBLFVBQUEsV0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxRQUFBLEVBQUEsV0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLGlCQUFBLENBQUEsU0FDQSxDQUFBLFlBQUE7QUFDQSx1QkFBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsQ0FBQTs7QUFHQSxZQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLG1CQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsa0JBQUEsRUFBQSxXQUFBLENBQUE7O2FBRUEsSUFBQSxDQUFBLFVBQUEsUUFBQSxFQUFBOztBQUVBLHVCQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsdUJBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLENBQUE7O0FBRUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLHVCQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7QUFDQSwwQkFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQSxDQUFBO0tBRUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxZQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsa0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGdCQUFBLEVBQUEsWUFBQTtBQUNBLGdCQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7O0FBRUEsa0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsVUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxFQUFBLEdBQUEsU0FBQSxDQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO1NBQ0EsQ0FBQTs7QUFFQSxZQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxnQkFBQSxDQUFBLEVBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxnQkFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7U0FDQSxDQUFBO0tBRUEsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxFQUFBLENBQUE7O0FDbEpBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxXQUFBLEVBQUEsYUFBQTtBQUNBLG1CQUFBLEVBQUEsNkJBQUE7QUFDQSxrQkFBQSxFQUFBLFlBQUE7QUFDQSxlQUFBLEVBQUE7QUFDQSxpQkFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLHVCQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTthQUNBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLElBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsU0FBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUE7O0FBRUEsY0FBQSxDQUFBLGFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxRQUFBLEdBQUEsS0FBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsUUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLEdBQUE7QUFDQSxpQkFBQSxFQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBO1NBQ0EsQ0FBQTtLQUNBOztBQUVBLFVBQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTtBQUNBLFlBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsbUJBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0EsTUFBQTtBQUNBLG1CQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0Esc0JBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTs7QUFFQSxVQUFBLENBQUEsMEJBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxtQkFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLG9CQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSwwQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7aUJBQ0EsTUFBQTtBQUNBLDBCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtpQkFDQTtBQUNBLHNCQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBLE1BQUE7QUFDQSxtQkFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxzQkFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFVBQUEsQ0FBQSxHQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtLQUNBLENBQUE7OztBQUdBLFFBQUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxFQUFBO0FBQ0EsVUFBQSxFQUFBLG9CQUFBO0FBQ0EsbUJBQUEsRUFBQSw4RkFBQTtLQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxZQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esb0JBQUEsRUFBQSxLQUFBO0FBQ0EsbUJBQUEsRUFBQSxLQUFBO0FBQ0EscUJBQUEsRUFBQSxLQUFBO0FBQ0Esa0JBQUEsRUFBQSxLQUFBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLFVBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTs7QUFFQSxZQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEVBQUEsRUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsWUFBQSxNQUFBLEVBQUEsUUFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsSUFBQSxHQUFBLENBQUEsQ0FBQSxTQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsS0FBQSxDQUFBOztBQUVBLGNBQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxHQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTs7QUFFQSxjQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsRUFBQSxTQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxFQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLEtBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsZ0JBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0Esb0JBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0E7Q0FFQSxDQUFBLENBQUE7QUN4SEEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxDQUFBLGtCQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEseUJBQUE7QUFDQSxtQkFBQSxFQUFBLDZDQUFBO0FBQ0Esa0JBQUEsRUFBQSx5QkFBQTtBQUNBLGVBQUEsRUFBQTtBQUNBLGlCQUFBLEVBQUEsZUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO2FBQ0E7U0FDQTtBQUNBLFlBQUEsRUFBQTtBQUNBLHdCQUFBLEVBQUEsSUFBQTtTQUNBO0tBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxVQUFBLENBQUEseUJBQUEsRUFBQSxVQUFBLFlBQUEsRUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsT0FBQSxHQUFBO0FBQ0EsWUFBQSxFQUFBLFVBQUE7QUFDQSxvQkFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxFQUFBO0FBQ0Esa0JBQUEsRUFBQSxJQUFBO1NBQ0E7S0FDQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxnQkFBQSxJQUFBLENBQUEsR0FBQSxLQUFBLFlBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxzQkFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO2FBQ0E7U0FDQSxDQUFBLENBQUE7O0FBRUEsY0FBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0tBQ0EsTUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0tBQ0E7O0FBRUEsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLG9CQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTs7QUFFQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO1NBQ0EsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTs7QUFFQSxvQkFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0Esa0JBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtTQUNBLENBQUEsQ0FBQTtLQUNBLENBQUE7QUFDQSxVQUFBLENBQUEsbUJBQUEsR0FBQSxZQUFBO0FBQ0EsY0FBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxlQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FFQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsWUFBQSxLQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLEVBQUEsQ0FBQSxDQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEVBQUEsS0FBQSxFQUFBLENBQUE7QUFDQSxlQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLGdCQUFBLGVBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxHQUFBLElBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLGVBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBOzs7QUFHQSxRQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTs7QUFFQSxZQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsbUJBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBO1NBQ0EsTUFBQTtBQUNBLG1CQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsS0FBQSxDQUFBO1NBQ0E7S0FDQSxDQUFBOztBQUVBLFFBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxPQUFBLEVBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTs7QUFFQSxLQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsRUFBQTtBQUNBLFVBQUEsRUFBQSxvQkFBQTtBQUNBLG1CQUFBLEVBQUEsOEZBQUE7S0FDQSxDQUFBLENBQUEsS0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFVBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxRQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esb0JBQUEsRUFBQSxLQUFBO0FBQ0EsbUJBQUEsRUFBQSxLQUFBO0FBQ0EscUJBQUEsRUFBQSxLQUFBO0FBQ0Esa0JBQUEsRUFBQSxLQUFBO1NBQ0E7QUFDQSxZQUFBLEVBQUE7QUFDQSx3QkFBQSxFQUFBLFVBQUE7U0FDQTtLQUNBLENBQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxZQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLG9CQUFBLENBQUEsUUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0tBQ0E7QUFDQSxRQUFBLE1BQUEsQ0FBQTtBQUNBLGdCQUFBLENBQUEsRUFBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTs7QUFFQSxZQUFBLGFBQUEsRUFBQSxZQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxNQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLFlBQUEsSUFBQSxHQUFBLENBQUEsQ0FBQSxTQUFBLENBQUE7QUFDQSxZQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsS0FBQSxDQUFBOztBQUVBLGNBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQTs7QUFFQSxjQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0Esb0JBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDeklBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxrQkFBQSxDQUFBLEtBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsb0JBQUE7QUFDQSxtQkFBQSxFQUFBLGtDQUFBO0FBQ0Esa0JBQUEsRUFBQSxVQUFBO0FBQ0EsZUFBQSxFQUFBO0FBQ0Esc0JBQUEsRUFBQSxvQkFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsdUJBQUEsWUFBQSxDQUFBLGFBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7YUFDQTtTQUNBO0FBQ0EsWUFBQSxFQUFBO0FBQ0Esd0JBQUEsRUFBQSxJQUFBO1NBQ0E7S0FDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsQ0FBQSxHQUFBLENBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLGVBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFlBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxlQUFBLFlBQUEsVUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGtCQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7U0FDQSxDQUFBLENBQUE7S0FDQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLFlBQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxHQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQTtLQUNBLEVBQ0EsTUFBQSxDQUFBLFlBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLG9CQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ3RDQSxHQUFBLENBQUEsT0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUE7O0FBRUEsV0FBQTs7QUFFQSxvQkFBQSxFQUFBLHdCQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSx1QkFBQSxHQUFBLENBQUEsSUFBQSxDQUFBO2FBQ0EsQ0FBQSxDQUFBO1NBQ0E7QUFDQSxtQkFBQSxFQUFBLHFCQUFBLE9BQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLHFCQUFBLEVBQUEsdUJBQUEsTUFBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSx5QkFBQSxHQUFBLE1BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLHVCQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FDQTtBQUNBLFlBQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTtBQUNBLG1CQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0EsZUFBQSxFQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLGlCQUFBLENBQUEsTUFBQSxHQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxDQUFBO0FBQ0EsbUJBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxjQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsdUJBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTthQUNBLENBQUEsQ0FBQTtTQUNBO0FBQ0Esa0JBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsbUJBQUEsS0FBQSxVQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtTQUNBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN2Q0EsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsWUFBQTtBQUNBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxtQkFBQSxFQUFBLHlEQUFBO0tBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ0xBLEdBQUEsQ0FBQSxTQUFBLENBQUEsUUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFdBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUE7QUFDQSxnQkFBQSxFQUFBLEdBQUE7U0FDQTtBQUNBLG1CQUFBLEVBQUEseUNBQUE7QUFDQSxZQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7O0FBRUEsaUJBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLEVBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxRQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxDQUNBLENBQUE7O0FBRUEsaUJBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsVUFBQSxHQUFBLFlBQUE7QUFDQSx1QkFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGlCQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSwyQkFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsMEJBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7aUJBQ0EsQ0FBQSxDQUFBO2FBQ0EsQ0FBQTs7QUFFQSxnQkFBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSwyQkFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLHlCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtpQkFDQSxDQUFBLENBQUE7YUFDQSxDQUFBOztBQUVBLGdCQUFBLFVBQUEsR0FBQSxTQUFBLFVBQUEsR0FBQTtBQUNBLHFCQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTthQUNBLENBQUE7O0FBRUEsbUJBQUEsRUFBQSxDQUFBOztBQUVBLHNCQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxzQkFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0Esc0JBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTs7O0FBR0EsYUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBO0FBQ0Esb0JBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUEsR0FBQSxFQUFBLEVBQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxRQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO2lCQUNBLE1BQUE7QUFDQSxxQkFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO2lCQUNBO2FBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxhQUFBLENBQUEsWUFBQTtBQUNBLGlCQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxPQUFBLEVBQUEsWUFBQTtBQUNBLHdCQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxxQkFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBLElBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQTtBQUNBLGlDQUFBLEVBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxHQUFBO3FCQUNBLEVBQUEsSUFBQSxFQUFBLGVBQUEsQ0FBQSxDQUFBO0FBQ0EseUJBQUEsQ0FBQSxjQUFBLEVBQUEsQ0FBQTtpQkFDQSxDQUFBLENBQUE7YUFDQSxDQUFBLENBQUE7U0FFQTs7S0FFQSxDQUFBO0NBRUEsQ0FBQSxDQUFBIiwiZmlsZSI6Im1haW4uanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG53aW5kb3cuYXBwID0gYW5ndWxhci5tb2R1bGUoJ0dlb1F1ZXN0JywgWydmc2FQcmVCdWlsdCcsICd1aS5yb3V0ZXInLCAndWkuc29ydGFibGUnLCAndWkuYm9vdHN0cmFwJywgJ25nQW5pbWF0ZScsICdsZWFmbGV0LWRpcmVjdGl2ZSddKTtcblxuYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHVybFJvdXRlclByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlcikge1xuICAgIC8vIFRoaXMgdHVybnMgb2ZmIGhhc2hiYW5nIHVybHMgKC8jYWJvdXQpIGFuZCBjaGFuZ2VzIGl0IHRvIHNvbWV0aGluZyBub3JtYWwgKC9hYm91dClcbiAgICAkbG9jYXRpb25Qcm92aWRlci5odG1sNU1vZGUodHJ1ZSk7XG4gICAgLy8gSWYgd2UgZ28gdG8gYSBVUkwgdGhhdCB1aS1yb3V0ZXIgZG9lc24ndCBoYXZlIHJlZ2lzdGVyZWQsIGdvIHRvIHRoZSBcIi9cIiB1cmwuXG4gICAgJHVybFJvdXRlclByb3ZpZGVyLm90aGVyd2lzZSgnL2Rhc2hib2FyZCcpO1xufSk7XG5cbi8vIFRoaXMgYXBwLnJ1biBpcyBmb3IgY29udHJvbGxpbmcgYWNjZXNzIHRvIHNwZWNpZmljIHN0YXRlcy5cbmFwcC5ydW4oZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUpIHtcblxuICAgIC8vIFRoZSBnaXZlbiBzdGF0ZSByZXF1aXJlcyBhbiBhdXRoZW50aWNhdGVkIHVzZXIuXG4gICAgdmFyIGRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGggPSBmdW5jdGlvbiAoc3RhdGUpIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlLmRhdGEgJiYgc3RhdGUuZGF0YS5hdXRoZW50aWNhdGU7XG4gICAgfTtcblxuICAgIC8vICRzdGF0ZUNoYW5nZVN0YXJ0IGlzIGFuIGV2ZW50IGZpcmVkXG4gICAgLy8gd2hlbmV2ZXIgdGhlIHByb2Nlc3Mgb2YgY2hhbmdpbmcgYSBzdGF0ZSBiZWdpbnMuXG4gICAgJHJvb3RTY29wZS4kb24oJyRzdGF0ZUNoYW5nZVN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50LCB0b1N0YXRlLCB0b1BhcmFtcykge1xuXG4gICAgICAgIGlmICghZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCh0b1N0YXRlKSkge1xuICAgICAgICAgICAgLy8gVGhlIGRlc3RpbmF0aW9uIHN0YXRlIGRvZXMgbm90IHJlcXVpcmUgYXV0aGVudGljYXRpb25cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkpIHtcbiAgICAgICAgICAgIC8vIFRoZSB1c2VyIGlzIGF1dGhlbnRpY2F0ZWQuXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FuY2VsIG5hdmlnYXRpbmcgdG8gbmV3IHN0YXRlLlxuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIC8vIElmIGEgdXNlciBpcyByZXRyaWV2ZWQsIHRoZW4gcmVuYXZpZ2F0ZSB0byB0aGUgZGVzdGluYXRpb25cbiAgICAgICAgICAgIC8vICh0aGUgc2Vjb25kIHRpbWUsIEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpIHdpbGwgd29yaylcbiAgICAgICAgICAgIC8vIG90aGVyd2lzZSwgaWYgbm8gdXNlciBpcyBsb2dnZWQgaW4sIGdvIHRvIFwibG9naW5cIiBzdGF0ZS5cbiAgICAgICAgICAgIGlmICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKHRvU3RhdGUubmFtZSwgdG9QYXJhbXMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28oJ2xvZ2luJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgfSk7XG5cbn0pO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9ob21lL2hvbWUuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdIb21lQ3RybCcsXG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIHJlcXVlc3RlZFVzZXI6IGZ1bmN0aW9uKEF1dGhTZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCByZXF1ZXN0ZWRVc2VyKSB7XG4gICAgLy8gSWYgdGhlcmUncyBhIGxvZ2dlZCBpbiB1c2VyIHVwb24gbG9hZCwgZ28gdG8gdGhlIGRhc2hib2FyZFxuICAgIGlmIChyZXF1ZXN0ZWRVc2VyKSAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHJlcXVlc3RlZFVzZXIuX2lkfSk7XG5cbiAgICAkc2NvcGUuaG9tZSA9IHRydWU7IC8vIFRvIGtub3cgd2hhdCBuYXYgbGlua3MgdG8gc2hvd1xuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5zaWdudXAgPSB7fTtcbiAgICAkc2NvcGUubG9naW5FcnJvciA9IG51bGw7XG4gICAgJHNjb3BlLnNpZ251cEVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UubG9naW4obG9naW5JbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5lcnJvciA9IFwiSSB0aGluayB5b3VcXCd2ZSBlbnRlcmVkIHRoZSB3cm9uZyBpbmZvLCBmcmllbmRcIjtcbiAgICAgICAgfSk7XG5cbiAgICB9O1xuXG4gICAgJHNjb3BlLnNlbmRTaWdudXAgPSBmdW5jdGlvbihzaWdudXBJbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIEF1dGhTZXJ2aWNlLnNpZ251cChzaWdudXBJbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuICAgICAgICB9KS5jYXRjaChmdW5jdGlvbigpe1xuICAgICAgICAgICAgJHNjb3BlLmVycm9yID0gXCJJJ20gYWZyYWlkIHdlIGFscmVhZHkgaGF2ZSBzb21lb25lIGJ5IHRoYXQgbmFtZVwiO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gUGFyYWxheCBlZmZlY3QgZm9yIGltYWdlc1xuICAgICQoZnVuY3Rpb24oKSB7XG4gICAgLy8gQ2FjaGUgdGhlIHdpbmRvdyBvYmplY3QgKG1ha2VzIGxvYWQgdGltZSBmYXN0ZXIpXG4gICAgdmFyICR3aW5kb3cgPSAkKHdpbmRvdyk7XG4gICAgLy8gUGFyYWxsYXggYmFja2dyb3VuZCBlZmZlY3RcbiAgICAkKCdzZWN0aW9uW2RhdGEtdHlwZT1cImJhY2tncm91bmRcIl0nKS5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgJGJnb2JqID0gJCh0aGlzKTsgLy8gYXNzaWduaW5nIHRoZSBvYmplY3RcbiAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vc2Nyb2xsIHRoZSBiYWNrZ3JvdW5kIGF0IHZhciBzcGVlZFxuICAgICAgICAgICAgLy8gdGhlIHlQb3MgaXMgYSBuZWdhdGl2ZSBiZWNhdXNlIHdlJ3JlIHNjcm9sbGluZyBpdCB1cFxuICAgICAgICAgICAgdmFyIHlQb3MgPSAtKCR3aW5kb3cuc2Nyb2xsVG9wKCkgLyAkYmdvYmouZGF0YSgnc3BlZWQnKSk7XG4gICAgICAgICAgICAvLyBQdXQgdG9nZXRoZXIgb3VyIGZpbmFsIGJhY2tncm91bmQgcG9zaXRpb25cbiAgICAgICAgICAgIHZhciBjb29yZHMgPSAnNTAlICcgKyB5UG9zICsgJ3B4JztcbiAgICAgICAgICAgIC8vIE1vdmUgdGhlIGJhY2tncm91bmRcbiAgICAgICAgICAgICRiZ29iai5jc3MoeyBiYWNrZ3JvdW5kUG9zaXRpb246IGNvb3JkcyB9KTtcbiAgICAgICAgfSk7IC8vIGVuZCB3aW5kb3cgc2Nyb2xsXG4gICAgfSk7XG59KTtcblxuXG5cbn0pOyIsIihmdW5jdGlvbiAoKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBIb3BlIHlvdSBkaWRuJ3QgZm9yZ2V0IEFuZ3VsYXIhIER1aC1kb3kuXG4gICAgaWYgKCF3aW5kb3cuYW5ndWxhcikgdGhyb3cgbmV3IEVycm9yKCdJIGNhblxcJ3QgZmluZCBBbmd1bGFyIScpO1xuXG4gICAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdmc2FQcmVCdWlsdCcsIFtdKTtcblxuICAgIGFwcC5mYWN0b3J5KCdTb2NrZXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghd2luZG93LmlvKSB0aHJvdyBuZXcgRXJyb3IoJ3NvY2tldC5pbyBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuaW8od2luZG93LmxvY2F0aW9uLm9yaWdpbik7XG4gICAgfSk7XG5cbiAgICAvLyBBVVRIX0VWRU5UUyBpcyB1c2VkIHRocm91Z2hvdXQgb3VyIGFwcCB0b1xuICAgIC8vIGJyb2FkY2FzdCBhbmQgbGlzdGVuIGZyb20gYW5kIHRvIHRoZSAkcm9vdFNjb3BlXG4gICAgLy8gZm9yIGltcG9ydGFudCBldmVudHMgYWJvdXQgYXV0aGVudGljYXRpb24gZmxvdy5cbiAgICBhcHAuY29uc3RhbnQoJ0FVVEhfRVZFTlRTJywge1xuICAgICAgICBsb2dpblN1Y2Nlc3M6ICdhdXRoLWxvZ2luLXN1Y2Nlc3MnLFxuICAgICAgICBsb2dpbkZhaWxlZDogJ2F1dGgtbG9naW4tZmFpbGVkJyxcbiAgICAgICAgbG9nb3V0U3VjY2VzczogJ2F1dGgtbG9nb3V0LXN1Y2Nlc3MnLFxuICAgICAgICBzZXNzaW9uVGltZW91dDogJ2F1dGgtc2Vzc2lvbi10aW1lb3V0JyxcbiAgICAgICAgbm90QXV0aGVudGljYXRlZDogJ2F1dGgtbm90LWF1dGhlbnRpY2F0ZWQnLFxuICAgICAgICBub3RBdXRob3JpemVkOiAnYXV0aC1ub3QtYXV0aG9yaXplZCdcbiAgICB9KTtcblxuICAgIGFwcC5mYWN0b3J5KCdBdXRoSW50ZXJjZXB0b3InLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsIEFVVEhfRVZFTlRTKSB7XG4gICAgICAgIHZhciBzdGF0dXNEaWN0ID0ge1xuICAgICAgICAgICAgNDAxOiBBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLFxuICAgICAgICAgICAgNDAzOiBBVVRIX0VWRU5UUy5ub3RBdXRob3JpemVkLFxuICAgICAgICAgICAgNDE5OiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCxcbiAgICAgICAgICAgIDQ0MDogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0dXNEaWN0W3Jlc3BvbnNlLnN0YXR1c10sIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHJlc3BvbnNlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgYXBwLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlcikge1xuICAgICAgICAkaHR0cFByb3ZpZGVyLmludGVyY2VwdG9ycy5wdXNoKFtcbiAgICAgICAgICAgICckaW5qZWN0b3InLFxuICAgICAgICAgICAgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiAkaW5qZWN0b3IuZ2V0KCdBdXRoSW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSk7XG4gICAgfSk7XG4gICAgYXBwLnNlcnZpY2UoJ0F1dGhTZXJ2aWNlJywgZnVuY3Rpb24gKCRodHRwLCBTZXNzaW9uLCAkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUywgJHEpIHtcblxuICAgICAgICBmdW5jdGlvbiBvblN1Y2Nlc3NmdWxMb2dpbihyZXNwb25zZSkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgU2Vzc2lvbi5jcmVhdGUoZGF0YS5pZCwgZGF0YS51c2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmV0dXJuIGRhdGEudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZXMgdGhlIHNlc3Npb24gZmFjdG9yeSB0byBzZWUgaWYgYW5cbiAgICAgICAgLy8gYXV0aGVudGljYXRlZCB1c2VyIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLlxuICAgICAgICB0aGlzLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIVNlc3Npb24udXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmdldExvZ2dlZEluVXNlciA9IGZ1bmN0aW9uIChmcm9tU2VydmVyKSB7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBleGlzdHMsIHdlXG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIHVzZXIgYXR0YWNoZWQgdG8gdGhhdCBzZXNzaW9uXG4gICAgICAgICAgICAvLyB3aXRoIGEgcHJvbWlzZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuXG4gICAgICAgICAgICAvLyBhbHdheXMgaW50ZXJmYWNlIHdpdGggdGhpcyBtZXRob2QgYXN5bmNocm9ub3VzbHkuXG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHksIGlmIHRydWUgaXMgZ2l2ZW4gYXMgdGhlIGZyb21TZXJ2ZXIgcGFyYW1ldGVyLFxuICAgICAgICAgICAgLy8gdGhlbiB0aGlzIGNhY2hlZCB2YWx1ZSB3aWxsIG5vdCBiZSB1c2VkLlxuXG4gICAgICAgICAgICBpZiAodGhpcy5pc0F1dGhlbnRpY2F0ZWQoKSAmJiBmcm9tU2VydmVyICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLndoZW4oU2Vzc2lvbi51c2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWFrZSByZXF1ZXN0IEdFVCAvc2Vzc2lvbi5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSB1c2VyLCBjYWxsIG9uU3VjY2Vzc2Z1bExvZ2luIHdpdGggdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIDQwMSByZXNwb25zZSwgd2UgY2F0Y2ggaXQgYW5kIGluc3RlYWQgcmVzb2x2ZSB0byBudWxsLlxuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL3Nlc3Npb24nKS50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9naW4gPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgXG5cbiAgICAgICAgdGhpcy5zaWdudXAgPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIC8vc2VuZHMgYSBwb3N0IHJlcXVlc3QgY29udGFpbmluZyB0aGUgdXNlcidzIGNyZWRlbnRpYWxzIHRvIFxuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJ2FwaS91c2Vycy9zaWdudXAnLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAvL29uY2UgdGhlIHVzZXIgaGFzIGJlZW4gY3JlYXRlZCBvbiB0aGUgYmFja2VuZC4uLlxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vYSBzZWNvbmQgcG9zdCByZXF1ZXN0IGlzIGNyZWF0ZWQgdG8gbG9nIHRoZSB1c2VyIGluXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgc2lnbnVwIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHNlc3Npb25JZCwgdXNlcikge1xuICAgICAgICAgICAgdGhpcy5pZCA9IHNlc3Npb25JZDtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0pKCk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3InLFxuXHR7XG5cdFx0dXJsOiAnL2VkaXRvci86aWQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3QtZWRpdG9yL2VkaXRvci5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnRWRpdG9yQ3RybCcsXG4gICAgcmVzb2x2ZToge1xuICAgIFx0cXVlc3Q6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcbiAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdHVuZGVmaW5lZDtcbiAgICBcdH0sXG4gICAgfSxcblx0XHRkYXRhOiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0VkaXRvckN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGVQYXJhbXMsICR1aWJNb2RhbCwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5KSB7XG5cdC8vdmFyaWFibGUgc2F2ZWQgdG8gc2hvdy9oaWRlIHF1ZXN0IGVkaXRvciB3aGVuIGVkaXRpbmcgaW5kaXZpZHVhbCBzdGF0ZXNcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRzY29wZS5uZXdRdWVzdCA9IGZhbHNlO1xuXHQvL2lmIHRoZXJlIGlzIG5vIG5ldyBxdWVzdCwgc2V0IHByb3BlcnRpZXMgXG5cdGlmKCFxdWVzdCkge1xuXHRcdCRzY29wZS5uZXdRdWVzdCA9IHRydWU7XG5cdFx0JHNjb3BlLnF1ZXN0PSB7XG5cdFx0XHRzdGFydDogIFs0MC43MjMwMDgsLTc0LjAwMDYzMjddXG5cdFx0fTtcblx0fVxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSlcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlTmV3KCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChzYXZlZFF1ZXN0KSB7XG5cdFx0XHRcdCRzY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtpZDogc2F2ZWRRdWVzdC5faWQsIHF1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHR9KVxuXHRcdH1cblx0fTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHRcdHZhciBxdWVzdE1hcCA9IEwubWFwKCdxdWVzdC1tYXAnKS5zZXRWaWV3KCRzY29wZS5xdWVzdC5zdGFydCwgMTMpO1xuXG5cdFx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG5cdCAgICBtYXhab29tOiAxOCxcblx0ICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcblx0ICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdFx0fSkuYWRkVG8ocXVlc3RNYXApO1xuXG5cdFx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0XHRxdWVzdE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcdFxuXG5cdFx0Ly8gSW5pdGlhbGlzZSB0aGUgZHJhdyBjb250cm9sIGFuZCBwYXNzIGl0IHRoZSBGZWF0dXJlR3JvdXAgb2YgZWRpdGFibGUgbGF5ZXJzXG5cdFx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0XHQgICAgZHJhdzoge1xuXHRcdCAgICBcdHBvbHlsaW5lOiBmYWxzZSxcblx0XHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0XHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHRcdCAgICBcdGNpcmNsZTogZmFsc2Vcblx0XHQgICAgfSxcblx0XHQgICAgZWRpdDoge1xuXHRcdCAgICAgICAgZmVhdHVyZUdyb3VwOiBkcmF3bkl0ZW1zXG5cdFx0ICAgIH1cblx0XHR9KTtcblxuXHRcdHF1ZXN0TWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXG5cdFx0dmFyIG1hcmtlciA9IEwubWFya2VyKCRzY29wZS5xdWVzdC5zdGFydCwge2RyYWdnYWJsZTogdHJ1ZX0pO1xuXHRcdHF1ZXN0TWFwLmFkZExheWVyKG1hcmtlcik7XG5cblx0XHRxdWVzdE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdC8vXHRyZW1vdmUgYW55IGV4aXN0aW5nIG1hcmtlcnNcblx0XHQgIGlmIChtYXJrZXIpIHF1ZXN0TWFwLnJlbW92ZUxheWVyKG1hcmtlcik7XG5cdFx0ICB2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuXHRcdCAgdmFyIGxheWVyID0gZS5sYXllcjtcblx0XHQgIC8vc2F2ZSBzdGFydCBsb2NhdGlvbiBvZiBuZXcgbWFya2VyXG5cdFx0ICAkc2NvcGUucXVlc3Quc3RhcnQgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuXHRcdCAgLy9jcmVhdGUgbWFya2VyIGFuZCBhZGQgdG8gbWFwXG5cdFx0ICBtYXJrZXIgPSBMLm1hcmtlcihbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCB7ZHJhZ2dhYmxlOiB0cnVlfSk7XG5cdFx0ICBxdWVzdE1hcC5hZGRMYXllcihtYXJrZXIpO1xuXHRcdH0pO1xuXG5cdFx0bWFya2VyLm9uKCdkcmFnZW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5zdGFydCA9IFtlLnRhcmdldC5fbGF0bG5nLmxhdCxlLnRhcmdldC5fbGF0bG5nLmxuZ107XG5cdFx0fSlcblxuXHRcdGlmICgkc2NvcGUubmV3UXVlc3QpIHtcblx0XHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdFx0cXVlc3RNYXAuc2V0VmlldyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0sIDE0KTtcblx0XHRcdFx0bWFya2VyLnNldExhdExuZyhbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV0pO1xuXHRcdFx0XHQkc2NvcGUucXVlc3Quc3RhcnQgPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHR9KTtcblx0XHR9XG5cbn0pIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3IucXVlc3RTdGVwJywge1xuXHRcdHVybDogJy9xdWVzdHN0ZXAvOnF1ZXN0U3RlcElkJywgXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy9xdWVzdC1zdGVwLWVkaXRvci9xdWVzdC1zdGVwLWVkaXRvci5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnUXVlc3RTdGVwRWRpdENvbnRyb2xsZXInLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG4gICAgXHRcdHJldHVybiAkc3RhdGVQYXJhbXMuaWQgIT09IFwiXCIgP1xuXHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0dW5kZWZpbmVkO1xuICAgIFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgYXV0aGVudGljYXRlOiB0cnVlXG4gICAgfVxuXHR9KVxufSlcblxuXG5hcHAuY29udHJvbGxlcignUXVlc3RTdGVwRWRpdENvbnRyb2xsZXInLCBmdW5jdGlvbiAoJHN0YXRlUGFyYW1zLCAkc2NvcGUsICRzdGF0ZSwgJHJvb3RTY29wZSwgcXVlc3QsIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkcm9vdFNjb3BlLmVkaXRvclZpc2libGUgPSBmYWxzZTtcblx0Ly9kZWZpbmQgbmV3IFN0ZXAgZm9yIGFkZGluZyB0byBzdGVwcyBhcnJheVxuXHQkc2NvcGUubmV3U3RlcCA9IHtcblx0XHRuYW1lOiAnTmV3IFN0ZXAnLFxuXHRcdHRhcmdldENpcmNsZToge1xuXHRcdFx0XHRjZW50ZXI6IFtdLFxuXHRcdFx0XHRyYWRpdXM6IG51bGxcblx0XHRcdH1cblx0XHR9XHRcblx0Ly9pZiB3ZSBoYXZlIHN0ZXBzLCBmaW5kIHRoZSBpbmRleCBvZiB0aGUgc3RlcCB0aGF0IHdoaWNoIG1hdGNoZXMgdGhlIHBhcmFtc1xuXHRpZigkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGggPiAwKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZm9yRWFjaCggZnVuY3Rpb24gKHN0ZXAsIGluZGV4KSB7XG5cdFx0XHRpZiAoc3RlcC5faWQgPT09ICRzdGF0ZVBhcmFtcy5xdWVzdFN0ZXBJZCkge1xuXHRcdFx0XHQkc2NvcGUucXVlc3QuaWR4ID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fSlcblx0XHQvL3NldHMgY3VycmVudFN0ZXAgdG8gdGhhdCBtYXRjaGluZyB0aGUgcGFyYW1ldGVyc1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5pZHhdO1xuXHR9IGVsc2Uge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdXG5cdH1cblx0Ly9mdW5jdGlvbiB0byBzd2l0Y2ggc3RhdGVzIHdpdGhpbiBtYXBTdGF0ZSBlZGl0b3Jcblx0JHNjb3BlLnN3aXRjaFN0ZXAgPSBmdW5jdGlvbiAoY2xpY2tlZFN0ZXApIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdC8vIHJlZGlyZWN0IHRvIHRoZSBjbGlja2VkIG1hcHN0YXRlXG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IGNsaWNrZWRTdGVwLl9pZH0pO1x0XG5cdFx0fSlcblx0fTtcblx0JHNjb3BlLnNhdmVRdWVzdFN0ZXBzID0gZnVuY3Rpb24gKCkge1xuXHQvL3VwZGF0ZXMgY3VycmVudCBtYXBTdGF0ZVxuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbihmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHRcdH0pXG5cdH07XG5cdCRzY29wZS5yZXR1cm5XaXRob3V0U2F2aW5nID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6ICRzY29wZS5xdWVzdC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XHRcblx0fTtcblx0JHNjb3BlLmFkZFF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5wdXNoKCRzY29wZS5uZXdTdGVwKTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aC0xXS5faWR9KTtcblx0XHR9KVxuXG5cdH07XG5cdCRzY29wZS5yZW1vdmVRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGluZGV4ID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuaW5kZXhPZigkc2NvcGUuY3VycmVudFN0ZXApO1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aWYgKGluZGV4ID09PSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIGluZGV4LS07XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0dmFyIHN0ZXBEZXN0aW5hdGlvbiA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aD09PTAgPyBudWxsIDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbaW5kZXhdLl9pZDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogc3RlcERlc3RpbmF0aW9ufSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pXG5cdH07XG5cblx0Ly8gLy9mdW5jdGlvbiB0byBzZXQgbWFwIHRvIGVpdGhlciB0YXJnZXQgcmVnaW9uIG9yIG1hcCBzdGFydGluZyBwb2ludCBpZiBubyB0YXJnZXQgcmVnaW9uXG5cdHZhciBtYXBWaWV3ID0gZnVuY3Rpb24gKCkge1xuXG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0cmV0dXJuKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJHNjb3BlLnF1ZXN0LnN0YXJ0XG5cdFx0fVxuXHR9O1xuXHQvLyAvL2luaXRpYWxpemUgbWFwIGFuZCBzZXQgdmlldyB1c2luZyBtYXBWaWV3IGZ1bmN0aW9uXG5cdHZhciBxdWVzdFN0ZXBNYXAgPSBMLm1hcCgncXVlc3Qtc3RlcC1tYXAnKS5zZXRWaWV3KG1hcFZpZXcoKSwgMTUpO1xuXHQvL2FkZCBwaXJhdGUgbWFwIHRpbGVzXG5cdEwudGlsZUxheWVyKCdodHRwczovL2FwaS50aWxlcy5tYXBib3guY29tL3Y0L3tpZH0ve3p9L3t4fS97eX0ucG5nP2FjY2Vzc190b2tlbj17YWNjZXNzVG9rZW59Jywge1xuICAgIG1heFpvb206IDE4LFxuICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcbiAgICBhY2Nlc3NUb2tlbjogJ3BrLmV5SjFJam9pYzJOdmRIUmxaMmR6SWl3aVlTSTZJbU5wYURab1p6aG1kakJqTURaMWNXbzVhR2N5YVhsdGVUa2lmUS5MWmUwLUlCUlFtWjBQa1FCc1lJbGl3J1xuXHR9KS5hZGRUbyhxdWVzdFN0ZXBNYXApO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIEZlYXR1cmVHcm91cCB0byBzdG9yZSBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGRyYXduSXRlbXMpO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIGRyYXcgY29udHJvbCBhbmQgcGFzcyBpdCB0aGUgRmVhdHVyZUdyb3VwIG9mIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd0NvbnRyb2wgPSBuZXcgTC5Db250cm9sLkRyYXcoe1xuXHQgICAgZHJhdzoge1xuXHQgICAgXHRwb2x5bGluZTogZmFsc2UsXG5cdCAgICBcdHBvbHlnb246IGZhbHNlLFxuXHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHQgICAgXHRtYXJrZXI6IGZhbHNlXG5cdCAgICB9LFxuXHQgICAgZWRpdDoge1xuXHQgICAgICAgIGZlYXR1cmVHcm91cDogZHJhd25JdGVtc1xuXHQgICAgfVxuXHR9KTtcblx0cXVlc3RTdGVwTWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXHQvL2lmIHRoZXJlIGlzIGEgdGFyZ2V0IHJlZ2lvbiwgZHJhdyBpdCBvbiB0aGUgbWFwXG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHR2YXIgY3VycmVudFJlZ2lvbiA9IEwuY2lyY2xlKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzKTtcblx0XHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY3VycmVudFJlZ2lvbik7XG5cdH1cblx0dmFyIGNpcmNsZTtcblx0cXVlc3RTdGVwTWFwLm9uKCdkcmF3OmNyZWF0ZWQnLCBmdW5jdGlvbiAoZSkge1xuXHQvL3JlbW92ZSB0aGUgbG9hZGVkIHJlZ2lvbiB0aGVuIHJlbW92ZSBhbnkgbmV3bHkgZHJhd24gY2lyY2xlc1xuICBcdGlmKGN1cnJlbnRSZWdpb24pIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjdXJyZW50UmVnaW9uKTtcbiAgXHRpZihjaXJjbGUpIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuICBcdHZhciB0eXBlID0gZS5sYXllclR5cGU7XG4gIFx0dmFyIGxheWVyID0gZS5sYXllcjtcbiAgXHQvL2Fzc2lnbiB0YXJnZXQgcmVnaW9uIHRvIHByb3BlcnRpZXMgb2YgZHJhd24gb2JqZWN0XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzID0gbGF5ZXIuX21SYWRpdXNcbiAgICAvL2RlY2xhcmUgbmV3IG9iamVjdCBiYXNlZCBvbiBwcm9wZXJ0aWVkIGRyYXduIGFuZCBhZGQgdG8gbWFwXG4gICAgY2lyY2xlID0gTC5jaXJjbGUoW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXSwgbGF5ZXIuX21SYWRpdXMpO1xuICAgIHF1ZXN0U3RlcE1hcC5hZGRMYXllcihjaXJjbGUpO1xuXHR9KTtcbn0pXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkYXNoYm9hcmQnLHtcblx0XHR1cmw6ICcvZGFzaGJvYXJkLzp1c2VySWQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvdXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdEYXNoQ3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0dXNlclF1ZXN0czogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LmdldFVzZXJRdWVzdHMoJHN0YXRlUGFyYW1zLnVzZXJJZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRGFzaEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlLCAkc2NvcGUsIHVzZXJRdWVzdHMsIFNlc3Npb24sIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5xdWVzdHMgPSBbXTtcblx0JHNjb3BlLnF1ZXN0cyA9IHVzZXJRdWVzdHMubWFwKGZ1bmN0aW9uKGcpIHsgXG5cdFx0Zy5zaG93RGV0YWlsID0gZmFsc2U7XG5cdFx0cmV0dXJuIGc7XG5cdH0pO1xuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fVxuXHQkc2NvcGUuZGVsZXRlUXVlc3QgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5kZWxldGUocXVlc3RDbGlja2VkKVxuXHRcdC50aGVuKCBmdW5jdGlvbiAoZGVsZXRlZFF1ZXN0KSB7XG5cdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSlcblx0XHR9KVxuXHR9XG5cdCRzY29wZS5wYXJlbnRDbGljayA9IGZ1bmN0aW9uKGluZGV4KSB7XG5cdFx0dmFyIHF1ZXN0ID0gJHNjb3BlLnF1ZXN0c1tpbmRleF1cblx0XHRxdWVzdC5zaG93RGV0YWlsID0gIXF1ZXN0LnNob3dEZXRhaWw7XG5cdH0sXG5cdCRzY29wZS5zd2l0Y2hBY3RpdmUgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0UXVlc3RGYWN0b3J5LnNhdmUocXVlc3RDbGlja2VkKVxuXHR9XG59KSIsImFwcC5mYWN0b3J5KCdRdWVzdEZhY3RvcnknLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24pIHtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsUXVlc3RzOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzJylcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldE9uZVF1ZXN0OiBmdW5jdGlvbihxdWVzdElkKXtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdElkKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbihyZXMpe1xuXHRcdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdFx0fSlcblx0XHR9LFxuXHRcdGdldFVzZXJRdWVzdHM6IGZ1bmN0aW9uKHVzZXJJZCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvdXNlcnF1ZXN0cy8nICsgdXNlcklkKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSlcblx0XHR9LFxuXHRcdHNhdmU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLnB1dCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCwgcXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSlcblx0XHR9LFxuXHRcdHNhdmVOZXc6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cXVlc3QuYXV0aG9yID0gU2Vzc2lvbi51c2VyLl9pZDtcblx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL3F1ZXN0cy8nLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSlcblx0XHR9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAuZGVsZXRlKCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkKVxuXHRcdH1cblx0fVxufSk7XG4iLCJhcHAuZGlyZWN0aXZlKCdmdWxsc3RhY2tMb2dvJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uaHRtbCdcbiAgICB9O1xufSk7IiwiYXBwLmRpcmVjdGl2ZSgnbmF2YmFyJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgaG9tZTogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdob21lJyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gUHJldHR5IFNjcm9sbGluZyBOYXZiYXIgRWZmZWN0XG4gICAgICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICgkKCcubmF2YmFyJykub2Zmc2V0KCkudG9wID4gNTApIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5hZGRDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykucmVtb3ZlQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQW5pbWF0ZWQgU2Nyb2xsIFRvIFNlY3Rpb25cbiAgICAgICAgICAgICQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnLnBhZ2Utc2Nyb2xsIGEnKS5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICQoJ2h0bWwsIGJvZHknKS5zdG9wKCkuYW5pbWF0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6ICQoJGFuY2hvci5hdHRyKCdocmVmJykpLm9mZnNldCgpLnRvcFxuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwLCAnZWFzZUluT3V0RXhwbycpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG4gICAgfTtcblxufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
