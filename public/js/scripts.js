/*
MIT License

Copyright (c) [2017] [Hal Knight]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */
$(function() {
	var csrfToken = $('meta[name="csrf-token"]').attr('content');
	$(document).ajaxSend(function(event, xhr) {
		if (csrfToken) {
			xhr.setRequestHeader('X-CSRF-Token', csrfToken);
		}
	});

	$('.post-comment').hide();
	$('.comments-panel').each(function() {
		var $commentsPanel = $(this);
		var isVisible = $commentsPanel.hasClass('comments-visible');
		$commentsPanel.find('.show-comments').attr('aria-expanded', isVisible ? 'true' : 'false');
	});
	$('.show-comments').off('click.comments');
	$('.show-comments').on('click.comments', function(event) {
		event.preventDefault();
		var $articleCard = $(this).closest('.article-card');
		var $commentsPanel = $articleCard.length
			? $articleCard.find('.comments-panel').first()
			: $('.comments-panel').first();
		var isVisible = $commentsPanel.toggleClass('comments-visible').hasClass('comments-visible');
		$(this).attr('aria-expanded', isVisible ? 'true' : 'false');
		$(this).find('i').toggleClass('fa-comments-o', !isVisible).toggleClass('fa-chevron-up', isVisible);
		$(this).contents().filter(function() {
			return this.nodeType === 3;
		}).last().replaceWith(isVisible ? ' Hide comments' : ' View comments');
	});
	$('.btn-comment, #btn-comment').off('click');
	$('.btn-comment, #btn-comment').on('click', function(event) {
		event.preventDefault();
		$(this).closest('.comments-panel').find('.post-comment').first().toggle();
	});

	var $recipientSearch = $('#recipientSearch');
	var $recipientSelect = $('#recipientEmail');
	if ($recipientSearch.length && $recipientSelect.length) {
		// Precompute each option's lowercase search text once instead of calling
		// .toLowerCase() on every option for every keystroke.
		var recipientOptions = $recipientSelect.find('option').map(function() {
			var $option = $(this);
			return {
				element: $option,
				isPlaceholder: !$option.val(),
				search: String($option.data('search') || $option.text()).toLowerCase()
			};
		}).get();

		var recipientSearchTimer = null;
		$recipientSearch.off('input.recipientSearch').on('input.recipientSearch', function() {
			var $input = $(this);
			clearTimeout(recipientSearchTimer);
			recipientSearchTimer = setTimeout(function() {
				var search = String($input.val() || '').toLowerCase().trim();
				recipientOptions.forEach(function(entry) {
					entry.element.toggle(entry.isPlaceholder || !search || entry.search.indexOf(search) !== -1);
				});
			}, 150);
		});
	}

	$('.message-form').off('submit.messageForm').on('submit.messageForm', function() {
		var form = this;
		var attachment = form.querySelector('input[name="attachment"]');
		if (attachment && attachment.files && attachment.files.length) {
			form.enctype = 'multipart/form-data';
		} else {
			form.removeAttribute('enctype');
		}
	});

  $('.prePublishButton').off('click');
	$('.prePublishButton').on('click', function(event) {
		$("[title='Source']").click();
		setTimeout(function() {
			$('.blogbody').text($('.Editor-editor').text());
			setTimeout(function() {
				$('.publishButton').click();
			}, 500);
		}, 500);
	});

  $('.updateProfile').off('click');
	$('.updateProfile').on('click', function(event) {
		$('.editProfileButton').click();
		setTimeout(function() {
			$('.editProfileButton').click();
			alert($("#adminTxt").val());
			if ($("#adminTxt").val() == "true") {
				$("#admin").attr("checked", "checked");
			} else {
				$("#admin").attr("checked", "");
			}
		}, 500);
	});

	var $stats = $('.stats');
	var $mainBlog = $('div.mainBlog');
	$('.hamburger').off('click.hamburger').on('click.hamburger',
			function(event) {
				event.preventDefault();
				if (!$stats.length) {
					return;
				}
				$mainBlog.toggleClass('col-sm-8');
				$stats.toggleClass('sidebar-hidden');
				$(this).attr('aria-expanded', $stats.hasClass('sidebar-hidden') ? 'false' : 'true');
			});

  $('#btn-like').off('click');
	$('#btn-like').on('click', function(event) {
		event.preventDefault();

		var postId = $(this).data('id');

		$.post('/articles/' + postId + '/like').done(function(data) {
			$('.likes-count').text(data.likes);
		});
	});

  $('.delete-post').off('click');
	$('.delete-post').on('click', function(event) {
		event.preventDefault();

		var $this = $(this);

		var remove = confirm('Are you sure you want to delete this post?');
		if (remove) {

			var postId = $(this).data('id');

			$.ajax({
				url : '/articles/' + postId,
				type : 'DELETE'
			}).done(function(result) {
				if (result) {
					setTimeout(function() {
						location = $this.data('redirect') || location.href;
					}, 0);
				}
			});
		}
	});

	$('.delete-article-attachment').off('click').on('click', function(event) {
		event.preventDefault();
		if (!confirm('Delete this attachment?')) {
			return;
		}
		var $button = $(this);
		$.post($button.data('url'), { _csrf: csrfToken }).done(function() {
			$button.closest('.existing-article-attachment').remove();
		}).fail(function() {
			alert('The attachment could not be deleted.');
		});
	});
  
  $('.delete-comment').off('click');
	$('.delete-comment').on('click', function(event) {
		event.preventDefault();

		var $this = $(this);

		var remove = confirm('Are you sure you want to delete this comment?');
		if (remove) {

			var postId = $(this).data('id');
      
			$.ajax({
				url : '/articles/' + postId + '/commentdelete',
				type : 'DELETE'
			}).done(function(result) {
				if (result) {
					setTimeout(function() {
						location.reload();
					}, 0);
				}
			});
		}
	});
  
  $('#searchByAuthor').on('click', function(event) {
		event.preventDefault();

			var name = $('#searchByAuthorName').val();
      
			location = "/home/" + encodeURIComponent(name) + "/searchbyauthor";
		
	});

  $('#searchByDate').on('click', function(event) {
		event.preventDefault();

			var from = $('#searchByDateFrom').val();
			var to = $('#searchByDateTo').val();

			if (!from || !to || from > to) {
				return;
			}

			location = "/home/searchbydate?from=" + encodeURIComponent(from) +
				"&to=" + encodeURIComponent(to);
		});

});